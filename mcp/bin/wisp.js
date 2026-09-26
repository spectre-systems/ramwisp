#!/usr/bin/env node
// Sem argumentos: servidor MCP (é o que o Claude Code/Codex executa). Com argumentos: CLI para humanos.
import { API, getToken, logout, startLogin } from "../src/account.js";
import { killAgent, listAgents, result, sealed, spawnAgent, waitAgent } from "../src/client.js";
import { serve } from "../src/mcp.js";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, d) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : d; };
const out = (x) => console.log(JSON.stringify(x, null, 2));

const HELP = `wisp — subagentes com RAM sob demanda (${API})

  wisp login                         conecta esta máquina à sua conta (navegador)
  wisp logout
  wisp spawn "missão" [--ram 2] [--engine claude|codex] [--model M] [--auth auto|login|key] [--workspace DIR] [--wait]
  wisp wait ID | result ID | kill ID
  wisp ls
  wisp setup                         mostra como adicionar o MCP ao Claude Code / Codex

Sem argumentos roda o servidor MCP (stdio).`;

async function main() {
  switch (cmd) {
    case undefined: case "mcp": return serve();
    case "login": {
      if (getToken()) return console.log(`já conectado a ${API} (wisp logout para trocar)`);
      const l = await startLogin();
      console.log(`${l.opened ? "Abri o navegador. Se não abriu, acesse" : "Abra"}: ${l.verification_uri_complete}\nCódigo: ${l.user_code}`);
      await l.done;
      return console.log("conectado ✓");
    }
    case "logout": logout(); return console.log("desconectado");
    case "spawn": {
      const r = await spawnAgent({ mission: rest[0], ram_gb: Number(flag("ram", 2)), engine: flag("engine", "claude"),
        model: flag("model"), auth: flag("auth", "auto"), timeout_s: Number(flag("timeout", 1800)), label: flag("label"), workspace: flag("workspace") });
      out(r);
      console.error("esperando a máquina e a atestação para mandar a missão selada…");
      await sealed(r.id);
      const now = await result(r.id);
      if (now.erro || ["failed", "killed", "expired"].includes(now.status)) { out(now); process.exit(1); }
      if (rest.includes("--wait")) return out(await waitAgent(r.id, 3600));
      return console.error(`missão entregue. Recolha com: wisp wait ${r.id}`);
    }
    case "wait": return out(await waitAgent(rest[0], Number(flag("max", 3600))));
    case "result": return out(await result(rest[0]));
    case "kill": return out(await killAgent(rest[0]));
    case "ls": return out(await listAgents());
    case "setup":
      return console.log(`Claude Code:\n  claude mcp add --scope user wisp -- npx -y ${API}/wisp.tgz\n\n` +
        `Codex (~/.codex/config.toml):\n  [mcp_servers.wisp]\n  command = "npx"\n  args = ["-y", "${API}/wisp.tgz"]\n  tool_timeout_sec = 1000`);
    default: return console.log(HELP);
  }
}

main().catch((e) => { console.error("erro:", e.message); process.exit(1); });
