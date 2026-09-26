// Ciclo de um subagente do lado do cliente: cria o job, espera a atestação, confere, sela e recolhe o resultado.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { call, ensureDir, getToken, writeSecret } from "./account.js";
import { verifyAttestation } from "./attest.js";
import { exportKey, importKey, newClientKey, openOutput, sealInput } from "./crypto.js";
import { engineCredential } from "./creds.js";

export const FINAL = ["done", "failed", "killed", "expired"];
const sealers = new Map();          // id -> Promise (selagem em andamento neste processo)
const sealErrors = new Map();
const collecting = new Map();
const watchers = new Map();        // id -> Promise (recolhe sozinho quando termina)       // id -> Promise (abertura em andamento: duas chamadas juntas não disputam a chave)

export class LoginRequired extends Error {}

const keyFile = (id) => join(ensureDir("jobs"), `${id}.json`);
// Cópia local do resultado já aberto: uma espera em segundo plano pode recolher o resultado e a resposta dela
// nunca chegar ao agente; com a cópia, a próxima chamada devolve o mesmo resultado em vez de "already collected".
export const RESULT_TTL_MS = 7 * 86400_000;
const resultFile = (id) => join(ensureDir("results"), `${id}.json`);
const MAX_WORKSPACE = 15 * 1024 * 1024;       // compactado
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next", "target", ".cache"]);

/** Copia do projeto: no git, o que ele rastreia + arquivos novos não ignorados (nunca o que está no .gitignore). */
export function packWorkspace(dir) {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`workspace is not a directory: ${root}`);
  let files;
  const git = spawnSync("git", ["-C", root, "ls-files", "-z", "-co", "--exclude-standard"], { maxBuffer: 256 * 1024 * 1024 });
  if (git.status === 0) {
    files = git.stdout.toString().split("\0").filter((f) => f && existsSync(join(root, f)));
  } else {
    files = [];
    const walk = (rel) => {
      for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(r); }
        else if (e.isFile() && !/^\.env(\.|$)/.test(e.name)) files.push(r);
      }
    };
    walk("");
  }
  if (!files.length) throw new Error(`workspace vazio: ${root}`);
  const tar = spawnSync("tar", ["-czf", "-", "-C", root, "--null", "-T", "-"], { input: files.join("\0"), maxBuffer: 256 * 1024 * 1024 });
  if (tar.status !== 0) throw new Error(`tar falhou: ${tar.stderr.toString().slice(0, 300)}`);
  if (tar.stdout.length > MAX_WORKSPACE) {
    throw new Error(`project too large (${(tar.stdout.length / 1048576).toFixed(1)} MB compressed, max 15 MB): ` +
      "point workspace at a subdirectory or ignore heavy files in .gitignore");
  }
  return { root, tgz: tar.stdout, files: files.length };
}
const devRoot = () => (process.env.WISP_DEV_ROOT ? readFileSync(process.env.WISP_DEV_ROOT, "utf8") : undefined);

export async function spawnAgent(o) {
  if (!getToken()) throw new LoginRequired();
  const engine = o.engine ?? "claude";
  let timeout = o.timeout_s ?? 1800;
  const cred = engineCredential(engine, o.auth ?? process.env.WISP_AUTH ?? "auto", timeout);
  let note;
  if (cred.left && cred.left - 300 < timeout) {
    timeout = Math.max(60, Math.floor(cred.left - 300));
    note = `timeout lowered to ${timeout}s (local login validity)`;
  }
  const ws = o.workspace ? packWorkspace(o.workspace) : null;
  const priv = newClientKey();
  const nonce = randomBytes(32);
  const job = await call("POST", "/api/jobs", { engine, ram_gb: o.ram_gb ?? 2, timeout_s: timeout,
    nonce: nonce.toString("base64"), label: o.label });
  writeSecret(keyFile(job.id), JSON.stringify({ id: job.id, priv: exportKey(priv), nonce: nonce.toString("base64"), engine,
    workspace: ws?.root, pid: process.pid }));
  const payload = Buffer.from(JSON.stringify({ engine, model: o.model, mission: o.mission, turns: o.max_turns ?? 20,
    timeout, auth: { kind: cred.kind, value: cred.value }, ...(ws ? { workspace_tgz: ws.tgz.toString("base64") } : {}) }));
  const p = sealWhenReady(job.id, priv, nonce, payload).finally(() => { payload.fill(0); sealers.delete(job.id); });
  sealers.set(job.id, p);
  p.catch(() => {});
  return { id: job.id, status: job.status, engine, ram_gb: job.ram_gb, instance_type: job.instance_type,
    credential: cred.source, reserved_usd: +(job.hold_cents / 100).toFixed(4),
    ...(ws ? { workspace: `${ws.root} (${ws.files} files, ${(ws.tgz.length / 1024).toFixed(0)} KB, encrypted)` } : {}),
    ...(note ? { note } : {}) };
}

async function sealWhenReady(id, priv, nonce, payload) {
  const until = Date.now() + 20 * 60_000;
  while (Date.now() < until) {
    const j = await call("GET", `/api/jobs/${id}`).catch(() => null);
    if (j && FINAL.includes(j.status)) return;
    if (j?.attestation) {
      let att;
      try {
        att = verifyAttestation(j.attestation, nonce, { devRootPem: devRoot() });
      } catch (e) {
        sealErrors.set(id, e.message);
        await call("DELETE", `/api/jobs/${id}`).catch(() => {});
        throw e;
      }
      const f = keyFile(id);
      const k = JSON.parse(readFileSync(f, "utf8"));
      writeSecret(f, JSON.stringify({ ...k, enclave_pub: att.enclavePub.toString("base64"), pcr0: att.pcr0, dev: att.dev }));
      await call("POST", `/api/jobs/${id}/input`, { sealed: sealInput(priv, att.enclavePub, nonce, payload) });
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("the machine was not ready within 20 min");
}

/** Espera a selagem terminar (útil para o CLI, que sai logo depois). */
export async function sealed(id) {
  await sealers.get(id);
}

function parseOutput(stdout) {
  const lines = stdout.trim().split("\n").filter(Boolean);
  try {
    const last = JSON.parse(lines.at(-1));
    const isCodex = last?.type === "turn.completed" || lines.slice(0, 3).some((l) => l.includes('"thread.started"'));
    if (!isCodex) return { engine: "claude", ...last };
    const res = { engine: "codex", result: "" };
    for (const l of lines) {
      let ev; try { ev = JSON.parse(l); } catch { continue; }
      const item = ev.item ?? {};
      if (ev.type === "item.completed" && item.type === "agent_message") res.result = item.text ?? "";
      else if (ev.type === "turn.completed") res.usage = ev.usage;
      else if (ev.type === "turn.failed" || ev.type === "error") { res.is_error = true; res.erro = ev.error?.message ?? ev.message; }
    }
    return res;
  } catch {
    return { raw: stdout.trim().slice(-2000) };
  }
}

function cachedResult(id) {
  try {
    const f = resultFile(id);
    if (Date.now() - statSync(f).mtimeMs > RESULT_TTL_MS) { rmSync(f, { force: true }); return null; }
    return JSON.parse(readFileSync(f, "utf8"));
  } catch { return null; }
}

/** Apaga cópias locais com mais de 7 dias (melhor esforço). */
export function pruneResults() {
  try {
    const d = ensureDir("results");
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      if (Date.now() - statSync(f).mtimeMs > RESULT_TTL_MS) rmSync(f, { force: true });
    }
  } catch { /* sem pasta ainda */ }
}

/**
 * Resultado final, ou o status se ainda roda. Ao abrir, guarda uma cópia local (0600, 7 dias), avisa o servidor
 * (que apaga a saída cifrada) e apaga a chave. Chamadas seguintes devolvem a cópia, na mesma sessão ou em outra.
 */
export async function result(id) {
  const cached = cachedResult(id);
  if (cached) return { ...cached, from_local_copy: true };
  if (collecting.has(id)) return collecting.get(id);
  const p = fetchResult(id).finally(() => collecting.delete(id));
  collecting.set(id, p);
  return p;
}

async function fetchResult(id) {
  const j = await call("GET", `/api/jobs/${id}`);
  const meta = { id, status: j.status, ram_gb: j.ram_gb, peak_mem_mib: j.peak_mem_mib, cost_usd: j.cost_cents != null ? +(j.cost_cents / 100).toFixed(4) : null };
  if (sealErrors.has(id)) return { ...meta, status: "failed", error: `refused for security: ${sealErrors.get(id)}` };
  if (!FINAL.includes(j.status)) return { ...meta, mem_used_mib: j.mem_used_mib };
  if (j.status !== "done" || !j.output) {
    rmSync(keyFile(id), { force: true });
    return { ...meta, error: j.error ?? (j.collected_at
      ? `result was already collected on another machine (it is kept only where it was opened, in ${ensureDir("results")})`
      : j.status) };
  }
  const f = keyFile(id);
  if (!existsSync(f)) return { ...meta, error: "the key to open this result is not on this machine" };
  const k = JSON.parse(readFileSync(f, "utf8"));
  const out = JSON.parse(openOutput(importKey(k.priv), Buffer.from(k.enclave_pub, "base64"), Buffer.from(k.nonce, "base64"), j.output).toString());
  const parsed = parseOutput(out.stdout ?? "");
  const res = { ...parsed, ...meta, exit_code: out.exit_code, duration_s: out.duration_s };
  if (out.exit_code === 124) res.error = "timeout";
  if (out.patch) {
    const f = join(ensureDir("patches"), `${id}.patch`);
    writeSecret(f, out.patch);
    res.patch_file = f;
    res.patch_stat = out.patch_stat;
    res.apply = k.workspace ? `git -C ${JSON.stringify(k.workspace)} apply ${JSON.stringify(f)}` : `git apply ${JSON.stringify(f)}`;
  } else if (out.patch === "") {
    res.patch_stat = "no changes to the project";
  } else if (out.patch_error) {
    res.patch_error = out.patch_error;
    res.patch_stat = out.patch_stat;
  }
  if (out.exit_code !== 0 && out.stderr_tail) res.stderr_tail = out.stderr_tail.slice(-1500);
  // a cópia vem ANTES de avisar o servidor e apagar a chave: se algo cair no meio, o resultado não se perde
  writeSecret(resultFile(id), JSON.stringify(res));
  await call("POST", `/api/jobs/${id}/collected`).catch(() => {});
  rmSync(f, { force: true });
  pruneResults();
  return res;
}

const nap = (ms) => new Promise((r) => setTimeout(r, ms).unref());

/**
 * Recolhe o resultado sozinho quando o subagente termina (guarda a cópia local), sem ninguém bloqueado esperando.
 * Os timers não seguram o processo: no CLI, sair continua saindo.
 */
export function watch(id) {
  if (watchers.has(id)) return;
  const p = (async () => {
    const until = Date.now() + 3 * 3600_000;
    while (Date.now() < until) {
      await nap(Number(process.env.WISP_WATCH_MS ?? 10_000));
      const r = await result(id).catch(() => null);
      if (r && (FINAL.includes(r.status) || r.error)) return;
    }
  })().finally(() => watchers.delete(id));
  watchers.set(id, p);
}

/**
 * Ao subir o MCP: volta a vigiar os subagentes desta máquina que ainda têm chave (sessão anterior caiu, etc.).
 * Um job que nunca foi selado e cujo processo selador morreu (a sessão acabou antes da máquina subir) não tem como
 * rodar: a missão só existia na memória daquele processo. Esse é derrubado na hora, para não ficar cobrando à toa.
 * Se o selador está vivo (outra sessão, ou o ajudante do Codex, que sobe o próprio MCP), só vigia.
 */
export function resumeWatches() {
  let names = [];
  try { names = readdirSync(ensureDir("jobs")).filter((n) => n.endsWith(".json")); } catch { return; }
  for (const n of names) {
    const id = n.slice(0, -5);
    if (sealers.has(id) || watchers.has(id)) continue;
    let k;
    try { k = JSON.parse(readFileSync(join(ensureDir("jobs"), n), "utf8")); } catch { continue; }
    if (k.enclave_pub || alive(k.pid)) watch(id);
    else if (getToken()) {
      killAgent(id).then(() => process.stderr.write(`ramwisp: ${id} was never delivered (the session ended first); stopped it\n`),
        () => {});
    }
  }
}

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

/** Espera vários de uma vez: volta quando todos terminarem (ou no limite), com o resultado de cada um. */
export async function waitAgents(ids, maxWaitS = 900) {
  const until = Date.now() + maxWaitS * 1000;
  for (;;) {
    const agents = await Promise.all(ids.map((id) => result(id).catch((e) => ({ id, error: e.message }))));
    const done = agents.every((r) => FINAL.includes(r.status) || r.error);
    if (done || Date.now() > until) return { all_done: done, agents };
    await nap(3000);
  }
}

export async function waitAgent(id, maxWaitS = 900) {
  const until = Date.now() + maxWaitS * 1000;
  for (;;) {
    const r = await result(id);
    if (FINAL.includes(r.status) || r.error || Date.now() > until) return r;
    await new Promise((res) => setTimeout(res, 3000));
  }
}

export async function killAgent(id) {
  const j = await call("DELETE", `/api/jobs/${id}`);
  rmSync(keyFile(id), { force: true });
  return { id, status: j.status, cost_usd: j.cost_cents != null ? +(j.cost_cents / 100).toFixed(4) : null };
}

export async function listAgents() {
  const [me, jobs] = await Promise.all([call("GET", "/api/me"), call("GET", "/api/jobs?limit=20")]);
  return {
    account: me.email, balance_usd: +(me.credit_cents / 100).toFixed(2),
    ram_available_gb: me.tiers.filter((t) => t.available).map((t) => t.ram_gb),
    agents: jobs.filter((j) => !FINAL.includes(j.status) || (j.status === "done" && !j.collected_at)).map((j) => ({
      id: j.id, status: j.status, engine: j.engine, ram_gb: j.ram_gb, mem_used_mib: j.mem_used_mib, label: j.label })),
  };
}
