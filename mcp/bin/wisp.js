#!/usr/bin/env node
// Sem argumentos: servidor MCP (é o que o Claude Code/Codex executa). Com argumentos: CLI para humanos.
import { API, getToken, logout, startLogin } from "../src/account.js";
import { killAgent, listAgents, result, sealed, spawnAgent, waitAgent } from "../src/client.js";
import { serve } from "../src/mcp.js";
import { readLog } from "../src/log.js";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, d) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : d; };
const out = (x) => console.log(JSON.stringify(x, null, 2));

const HELP = `ramwisp — subagents with on-demand RAM (${API})

  ramwisp login                      connect this machine to your account (browser)
  ramwisp logout
  ramwisp spawn "task" [--ram 2] [--engine claude|codex] [--model M] [--auth auto|login|key] [--workspace DIR] [--wait]
  ramwisp spawn - …                  read the task from stdin (heredoc)
  ramwisp logs ID [-f]               what it is doing (decrypted here); -f follows live
  ramwisp wait ID | result ID | kill ID
  ramwisp ls
  ramwisp skill                      install the ramwisp skill for Claude Code and Codex (no MCP needed)
  ramwisp setup                      how to add the MCP to Claude Code / Codex

With no arguments it runs the MCP server (stdio).`;

async function main() {
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
      console.error("waiting for the machine and its attestation to send the sealed task…");
      await sealed(r.id);
      const now = await result(r.id);
      if (now.error || ["failed", "killed", "expired"].includes(now.status)) { out(now); process.exit(1); }
      if (rest.includes("--wait")) return out(await waitAgent(r.id, 3600));
      return console.error(`task delivered. Collect it with: ramwisp wait ${r.id}`);
    }
    case "logs": {
      const follow = rest.includes("-f") || rest.includes("--follow");
      let after = 0;
      for (;;) {
        const r = await readLog(rest[0], after);
        if (r.error) throw new Error(r.error);
        for (const l of r.lines) console.log(l);
        after = r.next;
        if (!follow || ["done", "failed", "killed", "expired"].includes(r.status)) {
          if (follow) console.error(`— ${r.status}. Collect it with: ramwisp wait ${rest[0]}`);
          return;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
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
    case "wait": return out(await waitAgent(rest[0], Number(flag("max", 3600))));
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
