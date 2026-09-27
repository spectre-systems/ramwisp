// Servidor MCP (stdio, JSON-RPC por linha). Sem dependências.
import { createInterface } from "node:readline";
import { API, getClient, getToken, setClient, startLogin } from "./account.js";
import { readLog } from "./log.js";
import { LoginRequired, killAgent, listAgents, result, resumeWatches, spawnAgent, waitAgent, waitAgents, watch } from "./client.js";

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION = "0.1.9";

const INSTRUCTIONS = `ramwisp runs Claude Code or Codex subagents on ephemeral cloud machines with the RAM you ask for,
without loading this machine. Each subagent starts inside an isolated enclave (AWS Nitro): before sending anything,
this MCP cryptographically verifies the enclave image and encrypts the task and the user's login for that enclave only.
Not even the ramwisp operator can read the task, the credential or the result. The machine is destroyed when it finishes.

When to use: the user asks for remote subagents / "run it on ramwisp" / "spin up N subagents", or there are
independent, heavy tasks (builds, test suites, long research) that can run in parallel elsewhere.

How to use it well:
- Parallel: call spawn_agent for every task first, then wait for all of them with ONE wait_agent call (ids: [...]).
- Don't block the main conversation while subagents run (minutes to an hour). This MCP collects each result by itself
  when it finishes and keeps it on this machine for 7 days, so nothing is lost if nobody is waiting. By default,
  hand the waiting to a small background helper and keep working with the user:
  - Claude Code: launch a background Agent with model "sonnet" whose only job is to call wait_agent with the ids
    (repeat while it returns running) and report the full result text back. It must not spawn or kill anything.
  - Codex: spawn a sub-agent with model "gpt-6-luna" for that same job, then keep working and check on it later.
  - Without sub-agents: carry on with other work and call agent_result (instant) now and then.
  Only wait in the main thread yourself if the user explicitly asks to wait, or if this session is about to end
  (one-shot runs like \`claude -p\` or \`codex exec\`): the task is sent from this process once the machine is up,
  so ending the session before status is "running" stops the subagent.
- To work on the user's code, pass workspace (e.g. the project directory): an encrypted copy is sent,
  the subagent works on it and the changes come back as a patch (apply it with the "apply" command after reviewing).
  Without workspace the machine starts empty: put all context in the mission. It has internet (HTTPS) but no git/SSH access of the user.
- A machine takes ~1-3 min to start; wait_agent waits up to max_wait_s per call (call it again if it returns running).
- To see what a subagent is doing while it runs, call agent_progress (its commands, tool calls and messages, decrypted
  here). The user can also watch it live in a terminal with: npx -y ramwisp logs <id> -f
- Always collect with wait_agent or agent_result: the answer can only be decrypted on this machine.
  Once opened, the result stays readable here for 7 days: calling wait_agent/agent_result again returns the same answer,
  so a wait that ran in the background never loses it.
- Each subagent uses ramwisp credit (the machine) and the user's subscription/key (the model). Don't launch dozens.
- If a response says the user needs to sign in, show them the link.`;

const TOOLS = [
  { name: "spawn_agent", annotations: { title: "Launch a subagent", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    description: "Launch an ephemeral subagent on a machine with the requested RAM and return its id right away.",
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
  { name: "wait_agent", annotations: { title: "Wait for a subagent's result", readOnlyHint: true, openWorldHint: false },
    description: "Wait for the subagent to finish and return the result (field result = the answer). Safe to call again: a result already opened on this machine is returned again.",
    inputSchema: { type: "object", properties: {
      id: { type: "string", description: "One subagent id." },
      ids: { type: "array", items: { type: "string" }, description: "Several ids: returns when all of them finish (or at max_wait_s), with each result." },
      max_wait_s: { type: "integer", default: 900, maximum: 1800 } } } },
  { name: "agent_result", annotations: { title: "Read a subagent's result", readOnlyHint: true, openWorldHint: false },
    description: "Result without waiting: returns the answer or the current status (running, RAM in use).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "agent_progress", annotations: { title: "See what a subagent is doing", readOnlyHint: true, openWorldHint: false },
    description: "Live log of a running subagent (its tool calls, commands and messages), decrypted on this machine. Returns the last lines; pass after (the returned next) to get only new ones.",
    inputSchema: { type: "object", required: ["id"], properties: {
      id: { type: "string" }, after: { type: "integer", default: 0 }, tail: { type: "integer", default: 40, maximum: 400 } } } },
  { name: "kill_agent", annotations: { title: "Kill a subagent", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: "Kill the subagent and destroy its machine immediately.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "list_agents", annotations: { title: "List subagents and balance", readOnlyHint: true, openWorldHint: false },
    description: "Balance, available RAM sizes and subagents that are running or have results to collect.",
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

/** O que fazer depois do spawn, no idioma de cada cliente: esperar num ajudante pequeno, não na conversa principal. */
export function nextStep(id, client = getClient()) {
  const how = /codex/i.test(client)
    ? `use collaboration.spawn_agent to start a sub-agent with model "gpt-6-luna" whose only job is to call the ramwisp wait_agent tool`
    : /claude/i.test(client)
      ? `launch a background Agent with model "sonnet" whose only job is to call mcp__ramwisp__wait_agent`
      : `use a small background helper to call wait_agent`;
  return `Running. Don't block the user: ${how} with ids ["${id}"] (plus any other ids you just spawned), ` +
    `repeating while it returns running, and report the full result. If you can't, call agent_result later. ` +
    `Keep this session open at least until status is "running": the task is still being sent from here, ` +
    `and if the session ends first the subagent is stopped. After that the result is collected and kept on this machine automatically.`;
}

async function runTool(name, a) {
  if (name === "wisp_login") {
    if (getToken()) return { ok: true, msg: `already connected to ${API}` };
    const msg = await loginMessage();
    return msg ? { login_required: msg } : { ok: true, msg: "account connected" };
  }
  const attempt = () => {
    switch (name) {
      case "spawn_agent": return spawnAgent(a).then((r) => { watch(r.id); return { ...r, next: nextStep(r.id) }; });
      case "wait_agent":
        if (Array.isArray(a.ids) && a.ids.length) return waitAgents(a.ids.map(String), a.max_wait_s ?? 900);
        if (!a.id) throw new Error("pass id or ids");
        return waitAgent(a.id, a.max_wait_s ?? 900);
      case "agent_result": return result(a.id);
      case "agent_progress": return readLog(a.id, a.after ?? 0).then((r) => ({ ...r, lines: r.lines.slice(-(a.tail ?? 40)),
        ...(r.lines.length > (a.tail ?? 40) ? { omitted: r.lines.length - (a.tail ?? 40) } : {}),
        watch_in_terminal: `npx -y ramwisp logs ${a.id} -f` }));
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
  resumeWatches();
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
