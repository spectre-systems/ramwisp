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

## Launch — and follow it live, without blocking

```bash
ramwisp spawn - --ram 4 --workspace . --label "short, non-sensitive" --follow <<'MISSION'
<complete, self-contained task: everything the subagent needs to know>
MISSION
```

**Always run this command in the background** (Claude Code: Bash with `run_in_background: true`; Codex: a
background terminal) and go on talking with the user. No model has to sit waiting: the command itself is the
watcher. Its output is a live, decrypted stream of what happens on the machine, then the result:

```
   0s  · machine launching
  74s  · machine awaiting input
   —   task delivered to wp-1a2b3c4d; live log (encrypted for this computer):
   2s  ▶ Bash  npm ci
  31s    ↳ added 812 packages in 29s
  33s  ▶ Bash  npm test
  95s  💬 2 tests fail in packages/api; fixing the date parser…
 140s  ✔ finished · 9 turns · model $0.210
=== result ===
{ "id": "wp-1a2b3c4d", "status": "done", "result": "…", "patch_stat": "…", "apply": "git apply …" }
```

- Whenever the user asks how it is going — or at natural pauses in the conversation — read that background
  output and relay the latest lines in a sentence or two ("it's installing deps; tests are running"). Don't
  paste the whole stream. When the command exits you are notified: report the result.
- The user can watch the same stream in their own terminal: `npx -y ramwisp logs ID -f`.
- Several subagents: one background `spawn … --follow` per task, launched together.
- `-` reads the task from stdin (use a quoted heredoc; no shell-escaping problems).
- `--ram` 2 | 4 | 8 | 16 | 24 (GB); disk inside grows with RAM. Browsers / big installs: 8+.
- `--workspace DIR` sends an encrypted copy of the project (git-tracked + new non-ignored files, never
  `.gitignore`d ones, max 15 MB compressed). Changes come back as a patch.
- `--engine codex` to run Codex instead of Claude Code; `--model` to pick a model; `--timeout` seconds (default 1800, max 7200).
- The machine takes ~1–3 min to start. **Don't stop the command before "task delivered"**: the task is sent from
  this computer once the machine proves itself; stopping earlier stops the subagent.

## While it runs

- `ramwisp logs ID` — everything so far (decrypted here); `-f` follows.
- `ramwisp ssh ID -c "cmd"` — run a command inside the machine while it runs (as its user, in its project
  folder): `ps aux`, `ls`, `df -h`, or read its full conversation in `~/.claude/projects/*/*.jsonl`. End-to-end
  encrypted; only this computer can open it. Look, don't disturb its work unless the user asks.
- The user can get an interactive terminal there themselves: `npx -y ramwisp ssh ID` (Ctrl-] leaves). The
  machine exists only while the subagent runs.
- `ramwisp ls` — balance and running subagents.
- `ramwisp kill ID` — stop it and destroy the machine (prints its last log lines). Do this if the log shows it
  going the wrong way, and tell the user why.

## Collect

- The `--follow` command already prints the result at the end. Otherwise `ramwisp wait ID [--follow]` or `ramwisp result ID` (instant). The result stays readable on this
  computer for 7 days, so calling it again is safe.
- With a workspace: the JSON has `patch_stat` and an `apply` command (`git apply …`). Review the patch, then apply.
- `error` containing "sign in" / login: run `ramwisp login` and give the user the link it prints.

## Good missions

The machine starts empty apart from the workspace copy: no local files, no git/SSH credentials, no access to
this network. It has HTTPS internet, Python 3, Node.js/npm, git and curl. Put the goal, the constraints and the
expected output format in the mission. Each subagent uses ramwisp credit (machine time) and the user's own
subscription or API key (model) — don't launch dozens.
