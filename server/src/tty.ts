import { FINAL, getJob } from "./jobs.ts";

/**
 * Repasse do terminal cifrado (`ramwisp ssh`). Os quadros são cifrados ponta a ponta entre o CLI do cliente e a
 * enclave (TtyChannel): aqui só ficam filas em memória, nunca em disco. Vemos o tamanho e o horário dos quadros.
 */
type Frame = { sid: string; n: number; ct: string };
type Relay = { toEnclave: Frame[]; toClient: { seq: number; f: Frame }[]; seq: number; wake: Set<() => void> };

const relays = new Map<string, Relay>();
const MAX_FRAME_CT = 180_000;          // base64 de ~128 KB
const MAX_QUEUE = 1000;
const KEEP_OUT = 2000;

function relay(jobId: string): Relay {
  let r = relays.get(jobId);
  if (!r) relays.set(jobId, (r = { toEnclave: [], toClient: [], seq: 0, wake: new Set() }));
  return r;
}

function wake(r: Relay) {
  for (const w of r.wake) w();
  r.wake.clear();
}

/** Espera até `ready()` ou o prazo (long-poll). */
async function waitFor(r: Relay, ready: () => boolean, seconds: number) {
  const until = Date.now() + Math.min(Math.max(seconds, 0), 25) * 1000;
  while (!ready() && Date.now() < until) {
    await new Promise<void>((res) => {
      const t = setTimeout(res, until - Date.now());
      r.wake.add(() => { clearTimeout(t); res(); });
    });
  }
}

export function validFrames(x: unknown): Frame[] | null {
  if (!Array.isArray(x) || x.length === 0 || x.length > 64) return null;
  const out: Frame[] = [];
  for (const f of x as any[]) {
    if (typeof f?.sid !== "string" || f.sid.length > 32 || !Number.isInteger(f.n) || f.n < 0 ||
      typeof f.ct !== "string" || f.ct.length > MAX_FRAME_CT) return null;
    out.push({ sid: f.sid, n: f.n, ct: f.ct });
  }
  return out;
}

// cliente → enclave
export function clientSend(jobId: string, frames: Frame[]) {
  const r = relay(jobId);
  if (r.toEnclave.length + frames.length > MAX_QUEUE) return false;
  r.toEnclave.push(...frames);
  wake(r);
  return true;
}

export async function enclaveReceive(jobId: string, wait: number) {
  const r = relay(jobId);
  await waitFor(r, () => r.toEnclave.length > 0, wait);
  return r.toEnclave.splice(0);
}

// enclave → cliente
export function enclaveSend(jobId: string, frames: Frame[]) {
  const r = relay(jobId);
  for (const f of frames) r.toClient.push({ seq: ++r.seq, f });
  if (r.toClient.length > KEEP_OUT) r.toClient.splice(0, r.toClient.length - KEEP_OUT);
  wake(r);
}

export async function clientReceive(jobId: string, sid: string, after: number, wait: number) {
  const r = relay(jobId);
  const pick = () => r.toClient.filter((x) => x.seq > after && x.f.sid === sid);
  await waitFor(r, () => pick().length > 0 || isOver(jobId), wait);
  const frames = pick();
  return { frames: frames.map((x) => x.f), next: frames.at(-1)?.seq ?? after };
}

const isOver = (jobId: string) => { const j = getJob(jobId); return !j || FINAL.includes(j.status); };

/** Fim do job: acorda quem espera e, um minuto depois, apaga as filas. */
setInterval(() => {
  for (const [id, r] of relays) if (isOver(id)) { wake(r); setTimeout(() => relays.delete(id), 60_000).unref(); }
}, 5000).unref();
