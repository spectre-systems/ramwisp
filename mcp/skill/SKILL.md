---
name: ramwisp
description: Run Claude Code or Codex subagents on their own sealed cloud machine (AWS Nitro Enclave) with the RAM they need, instead of on this computer. Use when the user asks to run something "on ramwisp" / in a remote or cloud subagent, or for heavy independent jobs (test suites, builds, scraping with a browser, long research) that would eat local RAM. Uses the `ramwisp` CLI through the shell; no MCP needed.
---

# ramwisp — subagents on their own machine

Every subagent gets a fresh cloud machine. Before anything is sent, the CLI checks the machine's
hardware attestation and encrypts the task, the project copy and the user's login **only for that
machine**: the ramwisp operator can't read them. The machine is destroyed at the end. Always go
through the CLI below — never call the HTTP API directly (that would skip the attestation and the encryption).

Command: `npx -y ramwisp@latest <cmd>` (below just `ramwisp`).

## Launch

```bash
ramwisp spawn - --ram 4 --workspace . --label "short, non-sensitive" --wait <<'MISSION'
<complete, self-contained task: everything the subagent needs to know>
MISSION
```

- `-` reads the task from stdin (use a quoted heredoc; no shell-escaping problems).
- `--ram` 2 | 4 | 8 | 16 | 24 (GB). Browsers / big installs: 8+.
- `--workspace DIR` sends an encrypted copy of the project (git-tracked + new non-ignored files, never
  `.gitignore`d ones, max 15 MB compressed). Changes come back as a patch.
- `--engine codex` to run Codex instead of Claude Code; `--model` to pick a model; `--timeout` seconds (default 1800, max 7200).
- The machine takes ~1–3 min to start. The command prints the id right away (JSON), then waits until the
  task is delivered — **don't interrupt it before "task delivered"**, or the subagent is stopped.
- With `--wait` it stays until the end and prints the result JSON (`result` = the answer).

**Don't block the conversation.** Run the `spawn … --wait` command in the background (Claude Code: Bash with
`run_in_background: true` — you are notified when it exits; Codex: a background terminal, or spawn without
`--wait` and collect later). Several subagents: one background command each, then carry on with the user.

## While it runs

- `ramwisp logs ID` — what it is doing: commands, tool calls, messages (decrypted here). `-f` follows live.
  Tell the user they can watch it themselves in a terminal: `npx -y ramwisp logs ID -f`.
- `ramwisp ls` — balance and running subagents.
- `ramwisp kill ID` — stop it and destroy the machine (prints its last log lines).

## Collect

- `ramwisp wait ID` (blocks until done) or `ramwisp result ID` (instant). The result stays readable on this
  computer for 7 days, so calling it again is safe.
- With a workspace: the JSON has `patch_stat` and an `apply` command (`git apply …`). Review the patch, then apply.
- `error` containing "sign in" / login: run `ramwisp login` and give the user the link it prints.

## Good missions

The machine starts empty apart from the workspace copy: no local files, no git/SSH credentials, no access to
this network. It has HTTPS internet, Python 3, Node.js/npm, git and curl. Put the goal, the constraints and the
expected output format in the mission. Each subagent uses ramwisp credit (machine time) and the user's own
subscription or API key (model) — don't launch dozens.
