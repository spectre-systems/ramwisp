# ramwisp

Subagentes do Claude Code e do Codex em máquinas próprias na nuvem, com a RAM que precisarem.
Cada subagente roda numa AWS Nitro Enclave efêmera: antes de enviar qualquer coisa, este MCP confere a
atestação do hardware (raiz AWS Nitro Enclaves G1 + PCR0 publicado) e cifra missão, projeto e credencial
só para aquela enclave.

```bash
claude mcp add --scope user ramwisp -- npx -y ramwisp@latest
```

No primeiro uso ele abre o navegador para você entrar na sua conta. Mais em https://ramwisp.duckdns.org
