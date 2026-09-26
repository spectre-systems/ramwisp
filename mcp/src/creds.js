// Credencial do MOTOR (Claude/Codex), lida só nesta máquina. Sai daqui apenas cifrada para a enclave atestada.
// Só o access token vai: nunca o refresh token, então a sessão local nunca cai nem é rotacionada lá.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MIN_LEFT_S = 600;

function claudeLogin() {
  let raw = "";
  if (process.platform === "darwin") {
    try { raw = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
  }
  if (!raw.trim()) {
    const f = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), ".credentials.json");
    if (existsSync(f)) raw = readFileSync(f, "utf8");
  }
  try {
    const o = JSON.parse(raw).claudeAiOauth;
    return { token: o.accessToken, exp: o.expiresAt / 1000 };
  } catch { return null; }
}

function claudeCredential(mode, needS) {
  const key = process.env.WISP_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (mode !== "login" && key) return { kind: "anthropic_key", value: key, left: null, source: "API key" };
  if (mode === "key") throw new Error("key mode: set ANTHROPIC_API_KEY (or WISP_ANTHROPIC_API_KEY) in the MCP env");
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return { kind: "claude_oauth", value: process.env.CLAUDE_CODE_OAUTH_TOKEN, left: null, source: "CLAUDE_CODE_OAUTH_TOKEN" };
  let l = claudeLogin();
  if (l && l.exp - Date.now() / 1000 < Math.max(MIN_LEFT_S, needS)) {
    // quase vencendo: uma chamada mínima faz o Claude Code local renovar o próprio login
    spawnSync("claude", ["-p", "ok", "--max-turns", "1"], { stdio: "ignore", timeout: 120_000 });
    l = claudeLogin();
  }
  if (!l) throw new Error("no Claude Code login on this machine: run `claude` and sign in, or use a key (ANTHROPIC_API_KEY)");
  const left = l.exp - Date.now() / 1000;
  if (left < MIN_LEFT_S) throw new Error("the local Claude login did not refresh; open Claude Code once and try again");
  return { kind: "claude_oauth", value: l.token, left, source: "Claude Code login" };
}

const jwtExp = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).exp;

function codexCredential(mode) {
  const key = process.env.WISP_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (mode !== "login" && key) return { kind: "openai_key", value: key, left: null, source: "API key" };
  const path = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json");
  let d;
  try { d = JSON.parse(readFileSync(path, "utf8")); } catch {
    throw new Error(mode === "key" ? "key mode: set OPENAI_API_KEY in the MCP env" : "no Codex login on this machine: run `codex login`");
  }
  if (mode !== "login" && d.OPENAI_API_KEY) return { kind: "openai_key", value: d.OPENAI_API_KEY, left: null, source: "Codex API key" };
  if (mode === "key") throw new Error("key mode: set OPENAI_API_KEY in the MCP env");
  const t = d.tokens ?? {};
  const left = jwtExp(t.access_token) - Date.now() / 1000;
  if (left < MIN_LEFT_S) throw new Error("the Codex login expired; open Codex once on this machine");
  const slim = { auth_mode: d.auth_mode ?? "chatgpt", OPENAI_API_KEY: null, last_refresh: new Date().toISOString(),
    tokens: { id_token: t.id_token, access_token: t.access_token, account_id: t.account_id, refresh_token: "" } };
  return { kind: "codex_auth", value: JSON.stringify(slim), left, source: "ChatGPT/Codex login" };
}

/** mode: "auto" (chave se houver, senão login), "key" ou "login". */
export function engineCredential(engine, mode = process.env.WISP_AUTH ?? "auto", needS = 0) {
  return engine === "codex" ? codexCredential(mode) : claudeCredential(mode, needS);
}
