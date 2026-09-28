#!/usr/bin/env node
// Sem argumentos: servidor MCP (é o que o Claude Code/Codex executa). Com argumentos: CLI para humanos.
import { API, getToken, logout, startLogin } from "../src/account.js";
import { FINAL, killAgent, listAgents, resumeWatches, result, sealed, spawnAgent, waitAgent } from "../src/client.js";
import { call } from "../src/account.js";
import { serve } from "../src/mcp.js";
import { readLog } from "../src/log.js";
import { openTerminal } from "../src/tty.js";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, d) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : d; };
const out = (x) => console.log(JSON.stringify(x, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mostra as fases da máquina enquanto ela sobe (até a tarefa ser entregue). */
async function showBoot(id, until) {
  const t0 = Date.now();
  let last;
  while (!until.done) {
    const j = await call("GET", `/api/jobs/${id}`).catch(() => null);
    if (j && j.status !== last) { last = j.status; console.log(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  · machine ${j.status.replace("_", " ")}`); }
    await sleep(3000);
  }
}

/** Log ao vivo até o fim (as linhas já vêm decifradas). */
async function followLog(id) {
  let after = 0;
  for (;;) {
    const r = await readLog(id, after);
    if (r.error) throw new Error(r.error);
    for (const l of r.lines) console.log(l);
    after = r.next;
    if (FINAL.includes(r.status)) return r.status;
    await sleep(2000);
  }
}

const HELP = `ramwisp — subagents with on-demand RAM (${API})

  ramwisp login                      connect this machine to your account (browser)
  ramwisp logout
  ramwisp spawn "task" [--ram 2] [--engine claude|codex] [--model M] [--auth auto|login|key] [--workspace DIR] [--wait | --follow]
                                     --follow: stream the live log, then print the result
  ramwisp spawn - …                  read the task from stdin (heredoc)
  ramwisp logs ID [-f]               what it is doing (decrypted here); -f follows live
  ramwisp ssh ID [-c "cmd"]          a terminal inside the machine while it runs (end-to-end encrypted; Ctrl-] leaves)
  ramwisp wait ID [--follow] | result ID | kill ID
  ramwisp ls
  ramwisp skill                      install the ramwisp skill for Claude Code and Codex (no MCP needed)
  ramwisp setup                      how to add the MCP to Claude Code / Codex

With no arguments it runs the MCP server (stdio).`;

async function main() {
  // subagentes que uma sessão anterior não chegou a entregar: param de cobrar (os vivos são de outro processo)
  if (cmd && !["login", "logout", "help", "setup", "skill"].includes(cmd) && getToken()) resumeWatches({ watchLive: false });
  switch (cmd) {
    case undefined: case "mcp": return serve();
    case "login": {
      if (getToken()) return console.log(`already connected to ${API} (ramwisp logout to switch)`);
      const l = await startLogin();
      console.log(`${l.opened ? "Opened your browser. If it didn't open, visit" : "Open"}: ${l.verification_uri_complete}\nCode: ${l.user_code}`);
      await l.done;
      return console.log("connected ✓");
    }
    case "logout": logout(); return console.log("disconnected");
    case "spawn": {
      const mission = rest[0] === "-" ? readFileSync(0, "utf8") : rest[0];
      if (!mission?.trim()) throw new Error('missing task: ramwisp spawn "task" (or - to read it from stdin)');
      const r = await spawnAgent({ mission, ram_gb: Number(flag("ram", 2)), engine: flag("engine", "claude"),
        model: flag("model"), auth: flag("auth", "auto"), timeout_s: Number(flag("timeout", 1800)), label: flag("label"), workspace: flag("workspace") });
      out(r);
      const follow = rest.includes("--follow") || rest.includes("-f");
      console.error("waiting for the machine and its attestation to send the sealed task…");
      const booting = { done: false };
      const phases = follow ? showBoot(r.id, booting) : null;
      await sealed(r.id).finally(() => { booting.done = true; });
      await phases;
      const now = await result(r.id);
      if (now.error || ["failed", "killed", "expired"].includes(now.status)) { out(now); process.exit(1); }
      if (follow) {
        console.log(`   —  task delivered to ${r.id}; live log (encrypted for this computer):`);
        await followLog(r.id);
        console.log("=== result ===");
        return out(await waitAgent(r.id, 60));
      }
      if (rest.includes("--wait")) return out(await waitAgent(r.id, 3600));
      return console.error(`task delivered. Collect it with: ramwisp wait ${r.id}`);
    }
    case "logs": {
      if (rest.includes("-f") || rest.includes("--follow")) {
        const st = await followLog(rest[0]);
        return console.error(`— ${st}. Collect it with: ramwisp wait ${rest[0]}`);
      }
      const r = await readLog(rest[0]);
      if (r.error) throw new Error(r.error);
      return r.lines.forEach((l) => console.log(l));
    }
    case "skill": {
      const src = join(dirname(fileURLToPath(import.meta.url)), "..", "skill", "SKILL.md");
      const targets = [[".claude", "Claude Code"], [".codex", "Codex"]]
        .filter(([d]) => rest.length ? rest.includes(`--${d.slice(1)}`) : existsSync(join(homedir(), d)));
      if (!targets.length) return console.log(`Neither ~/.claude nor ~/.codex found. Copy ${src} into your skills folder.`);
      for (const [d, name] of targets) {
        const dest = join(homedir(), d, "skills", "ramwisp");
        mkdirSync(dest, { recursive: true });
        copyFileSync(src, join(dest, "SKILL.md"));
        console.log(`${name}: installed ${join(dest, "SKILL.md")}`);
      }
      return console.log("Restart the session; ask for work \"on ramwisp\". First time: npx -y ramwisp login");
    }
    case "ssh": case "shell": {
      const id = rest[0];
      const ci = rest.indexOf("-c");
      const cmd = ci >= 0 ? rest[ci + 1] : flag("command");
      const tty = process.stdin.isTTY && !cmd;
      const t = await openTerminal(id, {
        cmd, cols: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24, term: process.env.TERM,
        onWait: (s) => console.error(`waiting for ${id} to start running (now: ${s})…`),
        onReady: (m) => tty && console.error(`\x1b[2m— ${id}: encrypted terminal in ${m.cwd}. Ctrl-] to leave; the machine ends when the subagent finishes.\x1b[0m`),
        onData: (d) => process.stdout.write(d),
      });
      if (tty) {
        process.stdin.setRawMode(true);
        process.stdin.on("data", (d) => { if (d.includes(0x1d)) t.close(); else t.write(d); });
        process.stdout.on("resize", () => t.resize(process.stdout.columns, process.stdout.rows));
      } else if (!cmd) {
        process.stdin.on("data", (d) => t.write(d)).on("end", () => t.write("exit\n"));
      }
      const code = await t.done;
      if (tty) process.stdin.setRawMode(false);
      if (code === null) console.error(`\n— ${id} finished; its machine is gone.`);
      process.exit(code ?? 0);
    }
    case "wait":
      if (rest.includes("--follow") || rest.includes("-f")) { await followLog(rest[0]); console.log("=== result ==="); }
      return out(await waitAgent(rest[0], Number(flag("max", 3600))));
    case "result": return out(await result(rest[0]));
    case "kill": return out(await killAgent(rest[0]));
    case "ls": return out(await listAgents());
    case "setup":
      return console.log(`Claude Code:\n  claude mcp add --scope user ramwisp -- npx -y ramwisp@latest\n\n` +
        `Codex (~/.codex/config.toml):\n  [mcp_servers.ramwisp]\n  command = "npx"\n  args = ["-y", "ramwisp@latest"]\n  tool_timeout_sec = 1000`);
    default: return console.log(HELP);
  }
}

main().catch((e) => { console.error("error:", e.message); process.exit(1); });
