import { randomBytes } from "node:crypto";
import { config, pickInstance, RAM_TIERS } from "./config.ts";
import { credit, db, event, now } from "./db.ts";
import { sha256 } from "./auth.ts";
import { launch, liveInstances, terminate } from "./launcher.ts";

export const ACTIVE = ["launching", "booting", "fetching_image", "enclave_starting", "awaiting_input", "running"];
export const FINAL = ["done", "failed", "killed", "expired"];
const BOOT_ALLOWANCE_S = 900;       // reserva de crédito para boot e imagem, além do timeout da missão
const INPUT_WAIT_MS = 10 * 60_000;

export type Job = Record<string, any>;

export function publicJob(j: Job) {
  const meta = j.meta ? JSON.parse(j.meta) : null;
  return {
    id: j.id, label: j.label, engine: j.engine, client: j.client ?? null, ram_gb: j.ram_gb, timeout_s: j.timeout_s, status: j.status,
    instance_type: j.instance_type, enclave_mem_mib: j.enclave_mem_mib, enclave_cpus: j.enclave_cpus,
    mem_used_mib: j.mem_used_mib, mem_total_mib: j.mem_total_mib, peak_mem_mib: j.peak_mem_mib ?? meta?.peak_mem_mib,
    exit_code: meta?.exit_code ?? null, duration_s: meta?.duration_s ?? null,
    egress: j.egress ? JSON.parse(j.egress) : {}, error: j.error,
    cost_cents: j.cost_cents, hold_cents: j.hold_cents, rate_cents_h: j.rate_cents_h,
    created_at: j.created_at, launched_at: j.launched_at, attested_at: j.attested_at, started_at: j.started_at,
    finished_at: j.finished_at, collected_at: j.collected_at,
  };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

export function createJob(userId: string, tokenId: string | null, b: any, client: string | null = null) {
  if (config.launcher === "ec2" && !config.artifactBucket) {
    throw new HttpError(503, "a capacidade na nuvem ainda está sendo liberada; tente de novo mais tarde");
  }
  const engine = b.engine ?? "claude";
  if (!["claude", "codex"].includes(engine)) throw new HttpError(400, "engine: claude ou codex");
  const ram = Number(b.ram_gb ?? 2);
  if (!RAM_TIERS.includes(ram)) throw new HttpError(400, `ram_gb: um de ${RAM_TIERS.join(", ")}`);
  const timeout = Math.round(Number(b.timeout_s ?? 1800));
  if (!(timeout >= 60 && timeout <= 7200)) throw new HttpError(400, "timeout_s entre 60 e 7200");
  const nonce = String(b.nonce ?? "");
  if (Buffer.from(nonce, "base64").length !== 32) throw new HttpError(400, "nonce: 32 bytes em base64");
  const inst = pickInstance(ram);
  if (!inst) throw new HttpError(400, `sem máquina para ${ram} GB agora (limite da conta)`);
  const hold = (inst.rateCentsHour * (timeout + BOOT_ALLOWANCE_S)) / 3600;
  const user = db.prepare("SELECT credit_cents FROM users WHERE id = ?").get(userId) as { credit_cents: number };
  if (user.credit_cents < hold) {
    throw new HttpError(402, `crédito insuficiente: precisa reservar US$ ${(hold / 100).toFixed(2)}, ` +
      `saldo US$ ${(user.credit_cents / 100).toFixed(2)} (reduza timeout_s ou ram_gb)`);
  }
  const id = "wp-" + randomBytes(4).toString("hex");
  const jobToken = randomBytes(32).toString("base64url");
  db.prepare(`INSERT INTO jobs (id, user_id, token_id, label, engine, ram_gb, timeout_s, status, instance_type,
      enclave_mem_mib, enclave_cpus, rate_cents_h, hold_cents, nonce, job_token_hash, created_at, client)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, tokenId, b.label ? String(b.label).slice(0, 80) : null, engine, ram, timeout, inst.type,
      inst.enclaveMem, inst.enclaveCpus, inst.rateCentsHour, hold, nonce, sha256(jobToken), now(), client);
  credit(userId, -hold, "reserva", id);
  pendingTokens.set(id, jobToken);
  event(userId, id, "job.created", { engine, ram_gb: ram, instance_type: inst.type, client });
  tick().catch((e) => console.error("tick", e));
  return getJob(id)!;
}

/** O token do job só existe em memória até a máquina subir (vai no user-data). */
const pendingTokens = new Map<string, string>();

export const getJob = (id: string) => db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Job | undefined;

export function setStatus(j: Job, status: string, extra: Record<string, unknown> = {}) {
  const cols = Object.keys(extra);
  db.prepare(`UPDATE jobs SET status = ?${cols.map((k) => `, ${k} = ?`).join("")} WHERE id = ?`)
    .run(status, ...(Object.values(extra) as any[]), j.id);
  event(j.user_id, j.id, `job.${status}`, extra.error ? { error: extra.error } : undefined);
}

/** Fecha o job: derruba a máquina, devolve a reserva e cobra o tempo real (mínimo 60 s). */
export async function finish(j: Job, status: string, error?: string) {
  const fresh = getJob(j.id)!;
  if (FINAL.includes(fresh.status)) return;
  const end = now();
  // só cobra se uma máquina chegou a existir (falha ao pedir a máquina não custa nada)
  const secs = fresh.launched_at && fresh.instance_id ? Math.max(60, (end - fresh.launched_at) / 1000) : 0;
  const cost = (fresh.rate_cents_h * secs) / 3600;
  db.prepare("UPDATE jobs SET status = ?, finished_at = ?, cost_cents = ?, error = COALESCE(?, error), input_sealed = NULL WHERE id = ?")
    .run(status, end, cost, error ?? null, fresh.id);
  credit(fresh.user_id, fresh.hold_cents, "devolução da reserva", fresh.id);
  if (cost > 0) credit(fresh.user_id, -cost, `uso ${fresh.instance_type} ${Math.round(secs)}s`, fresh.id);
  event(fresh.user_id, fresh.id, `job.${status}`, { cost_cents: cost, secs: Math.round(secs), error });
  pendingTokens.delete(fresh.id);
  if (fresh.instance_id) {
    try { await terminate(fresh.instance_id); } catch (e) { console.error("terminate", fresh.id, e); }
  }
}

let ticking = false;
export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const active = (db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status IN (${ACTIVE.map(() => "?").join(",")})`)
      .get(...ACTIVE) as { n: number }).n;
    let free = config.maxInstances - active;
    const queued = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 20").all() as Job[];
    for (const j of queued) {
      if (free <= 0) break;
      const token = pendingTokens.get(j.id);
      if (!token) { await finish(j, "failed", "servidor reiniciou antes de subir a máquina"); continue; }
      setStatus(j, "launching", { launched_at: now() });
      free--;
      try {
        const instanceId = await launch({ jobId: j.id, jobToken: token, instanceType: j.instance_type,
          memMib: j.enclave_mem_mib, cpus: j.enclave_cpus,
          deadlineMin: Math.ceil((j.timeout_s + BOOT_ALLOWANCE_S) / 60) + 5 });
        db.prepare("UPDATE jobs SET instance_id = ? WHERE id = ?").run(instanceId, j.id);
        pendingTokens.delete(j.id);
      } catch (e: any) {
        console.error("launch", j.id, e);
        await finish(j, "failed", `não subiu a máquina: ${e?.name ?? ""} ${e?.message ?? e}`.slice(0, 400));
      }
    }
    const t = now();
    for (const j of db.prepare(`SELECT * FROM jobs WHERE status IN (${ACTIVE.map(() => "?").join(",")})`).all(...ACTIVE) as Job[]) {
      if (j.status === "awaiting_input" && j.attested_at && t - j.attested_at > INPUT_WAIT_MS) {
        await finish(j, "expired", "o cliente não mandou a missão selada a tempo");
      } else if (j.launched_at && t - j.launched_at > (j.timeout_s + BOOT_ALLOWANCE_S + 300) * 1000) {
        await finish(j, "expired", "passou do tempo máximo");
      }
    }
  } finally {
    ticking = false;
  }
}

/** Derruba máquinas do projeto que não pertencem a nenhum job ativo. */
export async function reap() {
  const live = await liveInstances();
  for (const inst of live) {
    const j = inst.jobId ? getJob(inst.jobId) : undefined;
    const old = !inst.launchedAt || Date.now() - inst.launchedAt.getTime() > 180_000;
    if ((!j || FINAL.includes(j.status)) && old) {
      console.log("faxina: derrubando", inst.id, inst.jobId);
      try { await terminate(inst.id); } catch (e) { console.error("reap", e); }
    }
  }
}

export function startLoops() {
  // jobs em fila perderam o token com o restart: tick() fecha e devolve a reserva
  setInterval(() => tick().catch((e) => console.error("tick", e)), 2000);
  setInterval(() => reap().catch((e) => console.error("reap", e)), 60_000);
}

