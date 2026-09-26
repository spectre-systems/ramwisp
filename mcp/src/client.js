// Ciclo de um subagente do lado do cliente: cria o job, espera a atestação, confere, sela e recolhe o resultado.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { call, ensureDir, getToken, writeSecret } from "./account.js";
import { verifyAttestation } from "./attest.js";
import { exportKey, importKey, newClientKey, openOutput, sealInput } from "./crypto.js";
import { engineCredential } from "./creds.js";

export const FINAL = ["done", "failed", "killed", "expired"];
const sealers = new Map();          // id -> Promise (selagem em andamento neste processo)
const sealErrors = new Map();

export class LoginRequired extends Error {}

const keyFile = (id) => join(ensureDir("jobs"), `${id}.json`);
const devRoot = () => (process.env.WISP_DEV_ROOT ? readFileSync(process.env.WISP_DEV_ROOT, "utf8") : undefined);

export async function spawnAgent(o) {
  if (!getToken()) throw new LoginRequired();
  const engine = o.engine ?? "claude";
  let timeout = o.timeout_s ?? 1800;
  const cred = engineCredential(engine, o.auth ?? process.env.WISP_AUTH ?? "auto", timeout);
  let note;
  if (cred.left && cred.left - 300 < timeout) {
    timeout = Math.max(60, Math.floor(cred.left - 300));
    note = `timeout reduzido para ${timeout}s (validade do login local)`;
  }
  const priv = newClientKey();
  const nonce = randomBytes(32);
  const job = await call("POST", "/api/jobs", { engine, ram_gb: o.ram_gb ?? 2, timeout_s: timeout,
    nonce: nonce.toString("base64"), label: o.label });
  writeSecret(keyFile(job.id), JSON.stringify({ id: job.id, priv: exportKey(priv), nonce: nonce.toString("base64"), engine }));
  const payload = Buffer.from(JSON.stringify({ engine, model: o.model, mission: o.mission, turns: o.max_turns ?? 20,
    timeout, auth: { kind: cred.kind, value: cred.value } }));
  const p = sealWhenReady(job.id, priv, nonce, payload).finally(() => { payload.fill(0); sealers.delete(job.id); });
  sealers.set(job.id, p);
  p.catch(() => {});
  return { id: job.id, status: job.status, engine, ram_gb: job.ram_gb, instance_type: job.instance_type,
    credential: cred.source, reserved_usd: +(job.hold_cents / 100).toFixed(4), ...(note ? { note } : {}) };
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
  throw new Error("a máquina não ficou pronta em 20 min");
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

/** Resultado final (e apaga a chave local e a saída cifrada no servidor), ou o status se ainda roda. */
export async function result(id) {
  const j = await call("GET", `/api/jobs/${id}`);
  const meta = { id, status: j.status, ram_gb: j.ram_gb, peak_mem_mib: j.peak_mem_mib, cost_usd: j.cost_cents != null ? +(j.cost_cents / 100).toFixed(4) : null };
  if (sealErrors.has(id)) return { ...meta, status: "failed", erro: `recusado por segurança: ${sealErrors.get(id)}` };
  if (!FINAL.includes(j.status)) return { ...meta, mem_used_mib: j.mem_used_mib };
  if (j.status !== "done" || !j.output) {
    rmSync(keyFile(id), { force: true });
    return { ...meta, erro: j.error ?? (j.collected_at ? "resultado já recolhido antes" : j.status) };
  }
  const f = keyFile(id);
  if (!existsSync(f)) return { ...meta, erro: "a chave para abrir esse resultado não está nesta máquina" };
  const k = JSON.parse(readFileSync(f, "utf8"));
  const out = JSON.parse(openOutput(importKey(k.priv), Buffer.from(k.enclave_pub, "base64"), Buffer.from(k.nonce, "base64"), j.output).toString());
  await call("POST", `/api/jobs/${id}/collected`).catch(() => {});
  rmSync(f, { force: true });
  const parsed = parseOutput(out.stdout ?? "");
  const res = { ...parsed, ...meta, exit_code: out.exit_code, duration_s: out.duration_s };
  if (out.exit_code === 124) res.erro = "timeout";
  if (out.exit_code !== 0 && out.stderr_tail) res.stderr_tail = out.stderr_tail.slice(-1500);
  return res;
}

export async function waitAgent(id, maxWaitS = 900) {
  const until = Date.now() + maxWaitS * 1000;
  for (;;) {
    const r = await result(id);
    if (FINAL.includes(r.status) || r.erro || Date.now() > until) return r;
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
    conta: me.email, saldo_usd: +(me.credit_cents / 100).toFixed(2),
    ram_disponivel_gb: me.tiers.filter((t) => t.available).map((t) => t.ram_gb),
    agentes: jobs.filter((j) => !FINAL.includes(j.status) || (j.status === "done" && !j.collected_at)).map((j) => ({
      id: j.id, status: j.status, engine: j.engine, ram_gb: j.ram_gb, mem_used_mib: j.mem_used_mib, label: j.label })),
  };
}
