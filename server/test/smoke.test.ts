// Sobe o servidor de verdade (banco temporário, sem AWS) e exercita o caminho de uma conta nova pela API.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let proc: ReturnType<typeof spawn>;

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "wisp-server-test-"));
  proc = spawn(process.execPath, ["src/index.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, "t.db"), LAUNCHER: "local", PUBLIC_URL: BASE },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/api/public/info`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => { proc?.kill(); });

test("signup → free credit → API token → account and job routes", async () => {
  const info = await (await fetch(`${BASE}/api/public/info`)).json();
  assert.ok(info.signup_credit_cents > 0);
  assert.ok(Array.isArray(info.pcrs?.pcr0));

  const signup = await fetch(`${BASE}/api/auth/signup`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `t${Date.now()}@test.local`, password: "a-long-test-password", name: "t" }) });
  assert.equal(signup.status, 200);
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];

  // sem o cabeçalho anti-CSRF, sessão de navegador não cria token
  const csrf = await fetch(`${BASE}/api/tokens`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  assert.equal(csrf.status, 403);
  const tok = await (await fetch(`${BASE}/api/tokens`, { method: "POST",
    headers: { cookie, "x-wisp": "1", "content-type": "application/json" }, body: JSON.stringify({ label: "ci" }) })).json();
  assert.match(tok.token, /^wsp_/);
  const auth = { authorization: `Bearer ${tok.token}` };

  const me = await (await fetch(`${BASE}/api/me`, { headers: auth })).json();
  assert.equal(me.credit_cents, info.signup_credit_cents);

  // job de outra conta / inexistente: nada vaza
  assert.equal((await fetch(`${BASE}/api/jobs/wp-nope/log`, { headers: auth })).status, 404);
  // rotas da hospedeira exigem o token do job
  assert.equal((await fetch(`${BASE}/agent/log`, { method: "POST", body: "{}" })).status, 401);
  // back office: token de MCP nunca abre
  assert.equal((await fetch(`${BASE}/api/admin/overview`, { headers: auth })).status, 403);
});
