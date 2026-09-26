#!/usr/bin/env node
// Sem argumentos: servidor MCP (é o que o Claude Code/Codex executa). Com argumentos: CLI para humanos.
import { API, getToken, logout, startLogin } from "../src/account.js";
import { killAgent, listAgents, result, sealed, spawnAgent, waitAgent } from "../src/client.js";
import { serve } from "../src/mcp.js";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, d) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : d; };
const out = (x) => console.log(JSON.stringify(x, null, 2));

const HELP = `ramwisp — subagents with on-demand RAM (${API})

  ramwisp login                      connect this machine to your account (browser)
  ramwisp logout
  ramwisp spawn "task" [--ram 2] [--engine claude|codex] [--model M] [--auth auto|login|key] [--workspace DIR] [--wait]
  ramwisp wait ID | result ID | kill ID
  ramwisp ls
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
      const r = await spawnAgent({ mission: rest[0], ram_gb: Number(flag("ram", 2)), engine: flag("engine", "claude"),
        model: flag("model"), auth: flag("auth", "auto"), timeout_s: Number(flag("timeout", 1800)), label: flag("label"), workspace: flag("workspace") });
      out(r);
      console.error("waiting for the machine and its attestation to send the sealed task…");
      await sealed(r.id);
      const now = await result(r.id);
      if (now.error || ["failed", "killed", "expired"].includes(now.status)) { out(now); process.exit(1); }
      if (rest.includes("--wait")) return out(await waitAgent(r.id, 3600));
      return console.error(`task delivered. Collect it with: ramwisp wait ${r.id}`);
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
