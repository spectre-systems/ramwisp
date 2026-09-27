// Log ao vivo: a enclave manda as linhas do agente cifradas para esta máquina; aqui elas viram texto legível.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { call, ensureDir } from "./account.js";
import { importKey, openOutput } from "./crypto.js";

const clip = (s, n = 160) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

function toolArg(name, input = {}) {
  const v = input.command ?? input.file_path ?? input.path ?? input.url ?? input.pattern ?? input.query ?? input.description;
  return clip(v ?? JSON.stringify(input), 140);
}

/** Uma linha crua (stream-json do Claude Code, --json do Codex, stderr) → zero ou mais linhas legíveis. */
export function render(ev) {
  const t = `${String(Math.floor(ev.t ?? 0)).padStart(4)}s`;
  const at = (s) => `${t}  ${s}`;
  if (ev.s === "err") return [at(`! ${clip(ev.l, 200)}`)];
  if (ev.s === "wisp") return [at(`· ${ev.l}`)];
  let m;
  try { m = JSON.parse(ev.l); } catch { return [at(clip(ev.l, 200))]; }
  const out = [];
  // Claude Code
  if (m.type === "system" && m.subtype === "init") out.push(at(`● session started${m.model ? ` (${m.model})` : ""}`));
  else if (m.type === "assistant") {
    for (const c of m.message?.content ?? []) {
      if (c.type === "text" && c.text?.trim()) out.push(at(`💬 ${clip(c.text, 240)}`));
      else if (c.type === "tool_use") out.push(at(`▶ ${c.name}  ${toolArg(c.name, c.input)}`));
    }
  } else if (m.type === "user") {
    for (const c of m.message?.content ?? []) {
      if (c.type !== "tool_result") continue;
      const txt = Array.isArray(c.content) ? c.content.map((x) => x.text ?? "").join(" ") : c.content;
      out.push(at(`  ${c.is_error ? "✗" : "↳"} ${clip(txt, 160)}`));
    }
  } else if (m.type === "result") {
    out.push(at(`${m.is_error ? "✗" : "✔"} finished${m.num_turns ? ` · ${m.num_turns} turns` : ""}${m.total_cost_usd != null ? ` · model $${m.total_cost_usd.toFixed(3)}` : ""}`));
  }
  // Codex
  else if (m.type === "thread.started") out.push(at("● session started"));
  else if (m.type === "item.started" && m.item?.type === "command_execution") out.push(at(`▶ $ ${clip(m.item.command, 160)}`));
  else if (m.type === "item.completed") {
    const it = m.item ?? {};
    if (it.type === "agent_message") out.push(at(`💬 ${clip(it.text, 240)}`));
    else if (it.type === "command_execution") out.push(at(`  ${it.exit_code ? "✗" : "↳"} exit ${it.exit_code ?? "?"} ${clip(it.aggregated_output, 140)}`));
    else if (it.type === "file_change") out.push(at(`✎ ${(it.changes ?? []).map((c) => `${c.kind ?? ""} ${c.path}`).join(", ")}`));
    else if (it.type === "web_search") out.push(at(`▶ search  ${clip(it.query, 140)}`));
    else if (it.type === "mcp_tool_call") out.push(at(`▶ ${it.server}.${it.tool}`));
  } else if (m.type === "turn.failed" || m.type === "error") out.push(at(`✗ ${clip(m.error?.message ?? m.message, 200)}`));
  return out;
}

export const logCopy = (id) => join(ensureDir("results"), `${id}.log.json`);

/**
 * Busca e abre os trechos a partir de `after` ({ status, lines, chunks: [{seq, lines}], next }).
 * Depois de recolhido, a chave some e o servidor apaga o log: vale a cópia guardada na hora da coleta.
 */
export async function readLog(id, after = 0) {
  const f = join(ensureDir("jobs"), `${id}.json`);
  if (!existsSync(f)) {
    const copy = logCopy(id);
    if (existsSync(copy) && Date.now() - statSync(copy).mtimeMs < 7 * 86400_000) {
      const chunks = JSON.parse(readFileSync(copy, "utf8")).filter((c) => c.seq > after);
      return { status: "done", lines: chunks.flatMap((c) => c.lines), chunks, next: chunks.at(-1)?.seq ?? after, from_local_copy: true };
    }
    return { status: null, lines: [], chunks: [], next: after, error: "no key for this subagent on this machine (launched elsewhere, or collected over 7 days ago)" };
  }
  const k = JSON.parse(readFileSync(f, "utf8"));
  if (!k.enclave_pub) return { status: "starting", lines: [], chunks: [], next: after };
  const priv = importKey(k.priv), pub = Buffer.from(k.enclave_pub, "base64"), nonce = Buffer.from(k.nonce, "base64");
  const lines = [], chunks = [];
  let next = after, status;
  for (;;) {
    const r = await call("GET", `/api/jobs/${id}/log?after=${next}`);
    status = r.status;
    for (const e of r.entries) {
      const c = { seq: e.seq, lines: JSON.parse(openOutput(priv, pub, nonce, e.sealed, " log").toString()).flatMap(render) };
      chunks.push(c);
      lines.push(...c.lines);
      next = e.seq;
    }
    if (r.entries.length < 200) break;
  }
  return { status, lines, chunks, next };
}
