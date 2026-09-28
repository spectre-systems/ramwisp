// Terminal cifrado dentro da máquina do subagente (`ramwisp ssh`). Nada abre porta: os quadros vão cifrados
// (TtyChannel) pelo servidor do ramwisp, que só repassa. Só esta máquina, que tem a chave do job, abre a sessão.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { call, ensureDir } from "./account.js";
import { importKey, TtyChannel } from "./crypto.js";

const FINAL = ["done", "failed", "killed", "expired"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera o subagente estar rodando (a máquina só aceita terminal nessa fase). */
async function untilRunning(id, onWait) {
  for (let told = false; ;) {
    const j = await call("GET", `/api/jobs/${id}`);
    if (j.status === "running") return;
    if (FINAL.includes(j.status)) throw new Error(`the subagent is ${j.status}; its machine is gone`);
    if (!told) { onWait?.(j.status); told = true; }
    await sleep(2000);
  }
}

/**
 * Abre um shell (ou `cmd`) na máquina. onData(Buffer) recebe a saída; a promessa `done` resolve com o código de saída.
 * Devolve { write(buf), resize(cols, rows), close(), done }.
 */
export async function openTerminal(id, { cmd, cols = 80, rows = 24, term = "xterm-256color", onData, onReady, onWait } = {}) {
  const f = join(ensureDir("jobs"), `${id}.json`);
  if (!existsSync(f)) throw new Error("no key for this subagent on this machine (launched elsewhere, or already collected)");
  await untilRunning(id, onWait);                // rodando = tarefa entregue = a chave já tem a da enclave
  const k = JSON.parse(readFileSync(f, "utf8"));
  const ch = new TtyChannel(importKey(k.priv), Buffer.from(k.enclave_pub, "base64"), Buffer.from(k.nonce, "base64"));
  const sid = ch.sid.toString("base64");

  // envio em ordem (a enclave recusa contador fora de ordem): uma fila, um POST por vez, teclas juntadas
  let pending = [], sending = false, closed = false;
  const flush = async () => {
    if (sending || !pending.length) return;
    sending = true;
    while (pending.length) {
      const batch = pending.splice(0, 64);
      await call("POST", `/api/jobs/${id}/tty`, { frames: batch }).catch(() => {});
    }
    sending = false;
  };
  const send = (obj) => { pending.push(ch.seal(Buffer.from(JSON.stringify(obj)))); setTimeout(flush, 5); };
  let buf = [], timer = null;
  const write = (data) => {
    if (closed) return;
    buf.push(Buffer.from(data));
    timer ??= setTimeout(() => { timer = null; const b = Buffer.concat(buf); buf = []; send({ t: "d", d: b.toString("base64") }); }, 8);
  };

  send({ t: "open", cols, rows, term, ...(cmd ? { cmd } : {}) });
  const done = (async () => {
    let after = 0;
    for (;;) {
      const r = await call("GET", `/api/jobs/${id}/tty?sid=${encodeURIComponent(sid)}&after=${after}&wait=20`).catch(() => null);
      if (!r) { await sleep(1000); continue; }
      for (const fr of r.frames) {
        let m;
        try { m = JSON.parse(ch.open(fr).toString()); } catch { continue; }   // não é desta sessão, ou adulterado
        if (m.t === "d") onData?.(Buffer.from(m.d, "base64"));
        else if (m.t === "ready") onReady?.(m);
        else if (m.t === "exit") { closed = true; return m.code ?? 0; }
      }
      after = r.next;
      if (FINAL.includes(r.status)) { closed = true; return null; }     // a máquina acabou (subagente terminou)
    }
  })();
  return {
    write,
    resize: (c, r) => send({ t: "r", cols: c, rows: r }),
    close: () => { if (!closed) send({ t: "x" }); },
    done,
  };
}
