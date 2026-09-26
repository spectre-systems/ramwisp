// Conta wisp (não é a credencial do motor): token wsp_… guardado em ~/.config/wisp/credentials.json (0600).
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

export const API = (process.env.WISP_API ?? "https://ramwisp.com").replace(/\/$/, "");
// endereços antigos do mesmo serviço: um login salvo com eles continua valendo
const SAME_SERVICE = new Set(["https://ramwisp.com", "https://ramwisp.duckdns.org"]);
export const DIR = process.env.WISP_CONFIG_DIR ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "wisp");
const CRED = join(DIR, "credentials.json");

export function ensureDir(sub = "") {
  const d = join(DIR, sub);
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

export function writeSecret(path, data) {
  writeFileSync(path, data, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function getToken() {
  if (process.env.WISP_TOKEN) return process.env.WISP_TOKEN;
  try {
    const c = JSON.parse(readFileSync(CRED, "utf8"));
    return c.api === API || (SAME_SERVICE.has(c.api) && SAME_SERVICE.has(API)) ? c.token : null;
  } catch { return null; }
}

export function saveToken(token) {
  ensureDir();
  writeSecret(CRED, JSON.stringify({ api: API, token, saved_at: new Date().toISOString() }));
}

export function logout() {
  if (existsSync(CRED)) rmSync(CRED);
}

let client = "cli";
/** Quem está usando o MCP (vem do clientInfo do initialize: "claude-code", "codex-mcp-client"…). */
export function setClient(name) { if (name) client = String(name).slice(0, 60); }
export const getClient = () => client;

export async function call(method, path, body, { token = getToken(), timeoutMs = 30_000 } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Wisp-Client": client, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 300) }; }
  if (!r.ok) {
    const err = new Error(data?.error ?? `HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

export function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  try {
    const p = spawn(cmd, args, { stdio: "ignore", detached: true });
    p.on("error", () => {});
    p.unref();
    return true;
  } catch { return false; }
}

let pending = null;   // login em andamento (um por processo)

/** Começa (ou reaproveita) o login pelo navegador. Resolve quando aprovado. */
export function startLogin() {
  if (pending) return pending;
  const p = (async () => {
    const d = await call("POST", "/api/device/start", { client_name: `MCP em ${hostname()}` }, { token: null });
    const opened = openBrowser(d.verification_uri_complete);
    const done = (async () => {
      const until = Date.now() + d.expires_in * 1000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, d.interval * 1000));
        try {
          const r = await call("POST", "/api/device/poll", { device_code: d.device_code }, { token: null });
          saveToken(r.token);
          return r.token;
        } catch (e) {
          if (e.status !== 428) throw e;
        }
      }
      throw new Error("o login expirou; tente de novo");
    })();
    done.finally(() => { pending = null; }).catch(() => {});
    return { ...d, opened, done };
  })();
  pending = p;
  p.catch(() => { pending = null; });
  return p;
}
