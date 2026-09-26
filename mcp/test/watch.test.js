// Ninguém esperando: o MCP recolhe sozinho quando termina. E wait_agent com vários ids volta com todos.
import assert from "node:assert/strict";
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const V = Buffer.from("wisp-v1");
const raw = (k) => Buffer.from(createPublicKey(k).export({ format: "jwk" }).x, "base64url");
function sealOutput(enclavePriv, clientPubRaw, nonce, plaintext) {
  const clientPub = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: clientPubRaw.toString("base64url") }, format: "jwk" });
  const shared = diffieHellman({ privateKey: enclavePriv, publicKey: clientPub });
  const k = Buffer.from(hkdfSync("sha256", shared, nonce, Buffer.concat([V, Buffer.from(" out"), raw(enclavePriv), clientPubRaw]), 32));
  const iv = randomBytes(12);
  const c = createCipheriv("chacha20-poly1305", k, iv, { authTagLength: 16 });
  c.setAAD(Buffer.concat([V, Buffer.from(" out")]), { plaintextLength: plaintext.length });
  return { iv: iv.toString("base64"), ct: Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]).toString("base64") };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("finished subagents are collected with nobody waiting; wait_agent takes several ids", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wisp-watch-"));
  const jobs = new Map();
  const srv = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    const m = req.url.match(/^\/api\/jobs\/([\w-]+)(\/collected)?$/);
    const j = m && jobs.get(m[1]);
    if (!j) { res.statusCode = 404; return res.end("{}"); }
    if (req.method === "POST" && m[2]) { j.output = null; j.collected_at = Date.now(); return res.end("{}"); }
    res.end(JSON.stringify(j));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { WISP_CONFIG_DIR: dir, WISP_API: `http://127.0.0.1:${srv.address().port}`, WISP_TOKEN: "wsp_t", WISP_WATCH_MS: "50" });
  const { exportKey, newClientKey } = await import("../src/crypto.js");
  const { writeSecret, ensureDir } = await import("../src/account.js");
  const { result, resumeWatches, waitAgents } = await import("../src/client.js");
  const { nextStep } = await import("../src/mcp.js");

  const enclave = generateKeyPairSync("x25519").privateKey;
  const add = (id, answer) => {
    const client = newClientKey(), nonce = randomBytes(32);
    writeSecret(join(ensureDir("jobs"), `${id}.json`), JSON.stringify({ id, priv: exportKey(client), nonce: nonce.toString("base64"),
      engine: "claude", enclave_pub: raw(enclave).toString("base64") }));
    const job = { id, status: "running", ram_gb: 2, output: null, collected_at: null };
    jobs.set(id, job);
    return () => {
      job.status = "done";
      job.output = sealOutput(enclave, raw(client), nonce, Buffer.from(JSON.stringify({ stdout: JSON.stringify({ result: answer }), exit_code: 0 })));
    };
  };
  try {
    // 1. auto-collect: MCP (re)starts, the job finishes later, nobody calls wait
    const finishA = add("wp-a", "answer A");
    resumeWatches();
    await sleep(120);
    assert.equal(jobs.get("wp-a").collected_at, null, "still running: nothing collected");
    finishA();
    for (let i = 0; i < 40 && !jobs.get("wp-a").collected_at; i++) await sleep(25);
    assert.ok(jobs.get("wp-a").collected_at, "collected on its own");
    assert.ok(existsSync(join(dir, "results", "wp-a.json")), "local copy written");
    assert.equal((await result("wp-a")).result, "answer A");

    // 2. several ids in one wait: returns only when all are done, each with its result
    const finishB = add("wp-b", "answer B"), finishC = add("wp-c", "answer C");
    setTimeout(finishB, 100); setTimeout(finishC, 300);
    const w = await waitAgents(["wp-b", "wp-c"], 10);
    assert.equal(w.all_done, true);
    assert.deepEqual(w.agents.map((r) => r.result), ["answer B", "answer C"]);
    const partial = await waitAgents(["wp-a", "wp-missing"], 0);
    assert.equal(partial.agents[0].result, "answer A");

    // 3. the hint names the right small helper for each host
    assert.match(nextStep("wp-x", "claude-code"), /background Agent with model "sonnet"/);
    assert.match(nextStep("wp-x", "codex-mcp-client"), /model "gpt-6-luna"/);
    assert.match(nextStep("wp-x", "cursor"), /small background helper/);
  } finally {
    srv.close();
  }
});

test("an unsealed job is left alone while its sealing process lives, and stopped once it is gone", async () => {
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "wisp-orphan-"));
  const killed = [];
  const srv = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    const id = req.url.split("/")[3];
    if (req.method === "DELETE") { killed.push(id); return res.end(JSON.stringify({ id, status: "killed" })); }
    res.end(JSON.stringify({ id, status: "enclave_starting", ram_gb: 2 }));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  // num processo à parte: o módulo lê pasta e API do ambiente ao carregar
  const env = { ...process.env, WISP_CONFIG_DIR: dir, WISP_API: `http://127.0.0.1:${srv.address().port}`, WISP_TOKEN: "wsp_t", WISP_WATCH_MS: "60000" };
  const deadPid = spawnSync(process.execPath, ["-e", "0"]).pid;       // um processo que já terminou
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(join(dir, "jobs"), { recursive: true });
  writeFileSync(join(dir, "jobs", "wp-live.json"), JSON.stringify({ id: "wp-live", priv: "x", nonce: "x", pid: process.pid }));
  writeFileSync(join(dir, "jobs", "wp-dead.json"), JSON.stringify({ id: "wp-dead", priv: "x", nonce: "x", pid: deadPid }));
  const child = await new Promise((resolve) => {
    import("node:child_process").then(({ spawn }) => {
      const p = spawn(process.execPath, ["--input-type=module", "-e",
        `const c = await import(${JSON.stringify(new URL("../src/client.js", import.meta.url).href)}); c.resumeWatches(); setTimeout(() => process.exit(0), 1500);`],
        { env, stdio: "inherit" });
      p.on("exit", resolve);
    });
  });
  srv.close();
  assert.equal(child, 0);
  assert.deepEqual(killed, ["wp-dead"], "only the job whose sealer is gone is stopped");
});
