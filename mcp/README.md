# ramwisp

Claude Code and Codex subagents on their own cloud machines, with the RAM they need.
Every subagent runs inside an ephemeral AWS Nitro Enclave: before sending anything, this MCP verifies the
hardware attestation (AWS Nitro Enclaves Root G1 + published PCR0) and encrypts the task, the project and the
credential for that enclave only.

```bash
claude mcp add --scope user ramwisp -- npx -y ramwisp@latest
```

On first use it opens your browser so you can sign in. More at https://ramwisp.duckdns.org
