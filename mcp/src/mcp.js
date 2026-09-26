// Servidor MCP (stdio, JSON-RPC por linha). Sem dependências.
import { createInterface } from "node:readline";
import { API, getToken, setClient, startLogin } from "./account.js";
import { LoginRequired, killAgent, listAgents, result, spawnAgent, waitAgent } from "./client.js";

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION = "0.1.4";

const INSTRUCTIONS = `ramwisp runs Claude Code or Codex subagents on ephemeral cloud machines with the RAM you ask for,
without loading this machine. Each subagent starts inside an isolated enclave (AWS Nitro): before sending anything,
this MCP cryptographically verifies the enclave image and encrypts the task and the user's login for that enclave only.
Not even the ramwisp operator can read the task, the credential or the result. The machine is destroyed when it finishes.

When to use: the user asks for remote subagents / "run it on ramwisp" / "spin up N subagents", or there are
independent, heavy tasks (builds, test suites, long research) that can run in parallel elsewhere.

How to use it well:
- Parallel: call spawn_agent for every task first, then wait_agent for each id.
- To work on the user's code, pass workspace (e.g. the project directory): an encrypted copy is sent,
  the subagent works on it and the changes come back as a patch (apply it with the "apply" command after reviewing).
  Without workspace the machine starts empty: put all context in the mission. It has internet (HTTPS) but no git/SSH access of the user.
- A machine takes ~1-3 min to start; wait_agent waits up to 15 min per call (call it again if it returns running).
- Always collect with wait_agent or agent_result: the answer can only be decrypted on this machine.
- Each subagent uses ramwisp credit (the machine) and the user's subscription/key (the model). Don't launch dozens.
- If a response says the user needs to sign in, show them the link.`;

const TOOLS = [
  { name: "spawn_agent", description: "Launch an ephemeral subagent on a machine with the requested RAM and return its id right away.",
    inputSchema: { type: "object", required: ["mission"], properties: {
      mission: { type: "string", description: "Complete, self-contained task with all the context it needs." },
      engine: { type: "string", enum: ["claude", "codex"], default: "claude" },
      model: { type: "string", description: "Model for the engine. Omit for its default." },
      ram_gb: { type: "integer", enum: [2, 4, 8, 16, 24], default: 2, description: "Subagent RAM." },
      max_turns: { type: "integer", default: 20, description: "Claude only." },
      timeout_s: { type: "integer", default: 1800, minimum: 60, maximum: 7200 },
      auth: { type: "string", enum: ["auto", "login", "key"], default: "auto",
        description: "login = the user's subscription on this machine; key = API key from env; auto = key if present." },
      workspace: { type: "string", description: "Path to a directory/repo ON THIS MACHINE to send along. An encrypted copy is sent (in git: tracked files + new non-ignored files; never anything in .gitignore). The subagent works in ~/work and changes come back as a patch (patch_file + apply command). Max 15 MB compressed." },
      label: { type: "string", description: "Short label VISIBLE in the dashboard (don't put anything sensitive)." } } } },
  { name: "wait_agent", description: "Wait for the subagent to finish and return the result (field result = the answer).",
    inputSchema: { type: "object", required: ["id"], properties: {
      id: { type: "string" }, max_wait_s: { type: "integer", default: 900, maximum: 1800 } } } },
  { name: "agent_result", description: "Result without waiting: returns the answer or the current status (running, RAM in use).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "kill_agent", description: "Kill the subagent and destroy its machine immediately.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "list_agents", description: "Balance, available RAM sizes and subagents that are running or have results to collect.",
    inputSchema: { type: "object", properties: {} } },
  { name: "wisp_login", description: "Connect this MCP to the user's ramwisp account (opens the browser).",
    inputSchema: { type: "object", properties: {} } },
];

async function loginMessage() {
  const l = await startLogin();
  // with a browser open here, wait a bit for approval and continue on its own
  if (l.opened) {
    const ok = await Promise.race([l.done.then(() => true).catch(() => false), new Promise((r) => setTimeout(() => r(false), 120_000))]);
    if (ok) return null;
  }
  return `To use ramwisp, connect your account: open ${l.verification_uri_complete} and confirm the code ${l.user_code}.\n` +
    `No account yet? Create one there, with free credit. Then repeat the request.`;
}

async function runTool(name, a) {
  if (name === "wisp_login") {
    if (getToken()) return { ok: true, msg: `already connected to ${API}` };
    const msg = await loginMessage();
    return msg ? { login_required: msg } : { ok: true, msg: "account connected" };
  }
  const attempt = () => {
    switch (name) {
      case "spawn_agent": return spawnAgent(a);
      case "wait_agent": return waitAgent(a.id, a.max_wait_s ?? 900);
      case "agent_result": return result(a.id);
      case "kill_agent": return killAgent(a.id);
      case "list_agents": return listAgents();
      default: throw new Error(`unknown tool: ${name}`);
    }
  };
  try {
    if (!getToken()) throw new LoginRequired();
    return await attempt();
  } catch (e) {
    if (!(e instanceof LoginRequired) && e.status !== 401) throw e;
    const msg = await loginMessage();
    if (msg) return { login_required: msg };
    return await attempt();
  }
}

export function serve() {
  const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const { id, method, params } = msg;
    if (id === undefined) return;                              // notificações
    try {
      let res;
      if (method === "initialize") {
        setClient(params?.clientInfo?.name ?? "mcp");
        const v = PROTOCOLS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
        res = { protocolVersion: v, capabilities: { tools: {} }, serverInfo: { name: "ramwisp", version: VERSION }, instructions: INSTRUCTIONS };
      } else if (method === "tools/list") {
        res = { tools: TOOLS };
      } else if (method === "ping") {
        res = {};
      } else if (method === "tools/call") {
        try {
          const out = await runTool(params.name, params.arguments ?? {});
          res = { content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out, null, 1) }] };
        } catch (e) {
          res = { content: [{ type: "text", text: `error: ${e.message}` }], isError: true };
        }
      } else {
        return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method: ${method}` } });
      }
      send({ jsonrpc: "2.0", id, result: res });
    } catch (e) {
      send({ jsonrpc: "2.0", id, error: { code: -32603, message: e.message } });
    }
  });
}
