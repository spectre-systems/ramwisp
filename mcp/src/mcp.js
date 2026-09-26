// Servidor MCP (stdio, JSON-RPC por linha). Sem dependências.
import { createInterface } from "node:readline";
import { API, getToken, startLogin } from "./account.js";
import { LoginRequired, killAgent, listAgents, result, spawnAgent, waitAgent } from "./client.js";

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION = "0.1.2";

const INSTRUCTIONS = `wisp roda subagentes Claude Code ou Codex em máquinas efêmeras na nuvem, com a RAM que você pedir,
sem pesar esta máquina. Cada subagente nasce numa enclave isolada (AWS Nitro): antes de mandar qualquer coisa,
este MCP confere criptograficamente a imagem da enclave e cifra a missão e o login do usuário só para ela.
Nem o operador do wisp consegue ler a missão, a credencial ou o resultado. A máquina é destruída ao terminar.

Quando usar: o usuário pede subagente remoto / "roda no wisp" / "sobe N subagentes", ou há tarefas
independentes e pesadas (build, testes, pesquisa longa) que podem rodar em paralelo fora daqui.

Como usar bem:
- Paralelo: chame spawn_agent para todas as missões primeiro, depois wait_agent para cada id.
- Para trabalhar no código do usuário, passe workspace (ex.: o diretório do projeto): vai uma cópia cifrada,
  o subagente trabalha nela e as mudanças voltam como patch (aplique com o comando em "aplicar" depois de revisar).
  Sem workspace a máquina começa vazia: ponha todo o contexto na missão. Tem internet (HTTPS), mas não tem git/SSH do usuário.
- A máquina leva ~2-3 min para subir; wait_agent espera até 15 min por chamada (chame de novo se voltar running).
- Sempre recolha com wait_agent ou agent_result: a resposta só pode ser aberta nesta máquina.
- Cada subagente consome crédito do wisp (máquina) e a assinatura/chave do usuário (modelo). Não dispare dezenas.
- Se a resposta disser que é preciso entrar na conta, mostre o link ao usuário.`;

const TOOLS = [
  { name: "spawn_agent", description: "Sobe um subagente efêmero numa máquina com a RAM pedida e devolve o id na hora.",
    inputSchema: { type: "object", required: ["mission"], properties: {
      mission: { type: "string", description: "Missão completa e autocontida, com todo o contexto necessário." },
      engine: { type: "string", enum: ["claude", "codex"], default: "claude" },
      model: { type: "string", description: "Modelo do motor. Omitir = padrão dele." },
      ram_gb: { type: "integer", enum: [2, 4, 8, 16, 24], default: 2, description: "RAM do subagente." },
      max_turns: { type: "integer", default: 20, description: "Só vale para claude." },
      timeout_s: { type: "integer", default: 1800, minimum: 60, maximum: 7200 },
      auth: { type: "string", enum: ["auto", "login", "key"], default: "auto",
        description: "login = assinatura do usuário nesta máquina; key = chave de API do env; auto = chave se houver." },
      workspace: { type: "string", description: "Caminho de um diretório/repositório DESTA máquina para mandar junto. Vai uma cópia cifrada (no git: arquivos rastreados + novos não ignorados; nunca o que está no .gitignore). O subagente trabalha em ~/work e as mudanças voltam como patch (patch_file + comando aplicar). Máx. 15 MB compactado." },
      label: { type: "string", description: "Rótulo curto VISÍVEL no painel (não coloque nada sensível)." } } } },
  { name: "wait_agent", description: "Espera o subagente terminar e devolve o resultado (campo result = resposta).",
    inputSchema: { type: "object", required: ["id"], properties: {
      id: { type: "string" }, max_wait_s: { type: "integer", default: 900, maximum: 1800 } } } },
  { name: "agent_result", description: "Resultado sem esperar: devolve a resposta ou o status atual (running, RAM em uso).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "kill_agent", description: "Mata o subagente e destrói a máquina na hora.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  { name: "list_agents", description: "Saldo, RAM disponível e subagentes vivos ou com resultado para recolher.",
    inputSchema: { type: "object", properties: {} } },
  { name: "wisp_login", description: "Conecta este MCP à conta wisp do usuário (abre o navegador).",
    inputSchema: { type: "object", properties: {} } },
];

async function loginMessage() {
  const l = await startLogin();
  // com navegador aberto aqui, espera um pouco pela aprovação e segue sozinho
  if (l.opened) {
    const ok = await Promise.race([l.done.then(() => true).catch(() => false), new Promise((r) => setTimeout(() => r(false), 120_000))]);
    if (ok) return null;
  }
  return `Para usar o wisp, conecte sua conta: abra ${l.verification_uri_complete} e confirme o código ${l.user_code}.\n` +
    `Não tem conta? Crie lá mesmo, com crédito grátis. Depois repita o pedido.`;
}

async function runTool(name, a) {
  if (name === "wisp_login") {
    if (getToken()) return { ok: true, msg: `já conectado a ${API}` };
    const msg = await loginMessage();
    return msg ? { login_necessario: msg } : { ok: true, msg: "conta conectada" };
  }
  const attempt = () => {
    switch (name) {
      case "spawn_agent": return spawnAgent(a);
      case "wait_agent": return waitAgent(a.id, a.max_wait_s ?? 900);
      case "agent_result": return result(a.id);
      case "kill_agent": return killAgent(a.id);
      case "list_agents": return listAgents();
      default: throw new Error(`ferramenta desconhecida: ${name}`);
    }
  };
  try {
    if (!getToken()) throw new LoginRequired();
    return await attempt();
  } catch (e) {
    if (!(e instanceof LoginRequired) && e.status !== 401) throw e;
    const msg = await loginMessage();
    if (msg) return { login_necessario: msg };
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
          res = { content: [{ type: "text", text: `erro: ${e.message}` }], isError: true };
        }
      } else {
        return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `método desconhecido: ${method}` } });
      }
      send({ jsonrpc: "2.0", id, result: res });
    } catch (e) {
      send({ jsonrpc: "2.0", id, error: { code: -32603, message: e.message } });
    }
  });
}
