# ramwisp

**Your subagents don’t fit in your RAM.** ramwisp runs every Claude Code or Codex subagent on its own
ephemeral cloud machine — an AWS Nitro Enclave — with the RAM it needs, using **your own** subscription
or API key. The task, your project and your credential are encrypted to the enclave; not even the server
operator can read them. When the subagent finishes, the machine is destroyed.

Hosted service: **https://ramwisp.com** · MCP on npm: [`ramwisp`](https://www.npmjs.com/package/ramwisp)

```bash
claude mcp add --scope user ramwisp -- npx -y ramwisp@latest
```

## How it works

```
your laptop                         ramwisp server                 AWS (one EC2 per subagent)
┌──────────────────────┐            ┌────────────────┐            ┌──────────────────────────────┐
│ Claude Code / Codex  │            │ accounts, jobs │            │ host (untrusted)             │
│  └ ramwisp MCP  ─────┼── spawn ──▶│ credits, queue │── launch ─▶│  └ Nitro Enclave             │
│     1. verify attest.│◀─ attest. ─┤ relays bytes   │◀───────────┤     signed attestation (PCR0)│
│     2. seal task+key │── sealed ─▶│ (ciphertext    │───────────▶│     opens task, runs agent   │
│     3. open result   │◀─ sealed ──┤  only)         │◀───────────┤     seals result, evaporates │
└──────────────────────┘            └────────────────┘            └──────────────────────────────┘
```

1. The MCP asks the server for a machine. The server launches an EC2 instance with a Nitro Enclave.
2. The enclave returns an attestation document signed by AWS hardware, containing the hash of the running
   image (PCR0) and a fresh X25519 public key. The MCP checks the certificate chain up to the
   **AWS Nitro Enclaves Root G1**, the COSE signature, the nonce and the PCR0 against `mcp/pcrs.json`.
3. Only then does it encrypt the task, an optional copy of your project (git-tracked files only) and your
   credential (access token only, never the refresh token) with ChaCha20-Poly1305 to that key.
4. The agent runs inside the enclave. Network egress goes through the host as a blind TCP tunnel
   (hostname and port are visible, TLS is end to end). Private and metadata IPs are blocked.
5. The answer and a patch come back sealed to your machine. The instance is terminated.

The server only ever stores ciphertext plus metadata (time, RAM, cost, exit code, domains reached).

## Repository layout

| Path | What | License |
|---|---|---|
| `mcp/` | MCP server + CLI (`npx ramwisp`): attestation check, sealing, workspace packing | Apache-2.0 |
| `enclave/` | Enclave image (Dockerfile) and runner: NSM attestation, sealed channel, egress proxy | Apache-2.0 |
| `parent/` | Host agent on the EC2 instance: starts the enclave, relays bytes, egress filter | Sustainable Use |
| `server/` | API, accounts, credits, job queue, EC2 launcher, Stripe top-ups, admin | Sustainable Use |
| `web/` | Site and dashboard (Vite + React) | Sustainable Use |
| `infra/` | AWS setup, enclave image build, Stripe webhook setup | Sustainable Use |

## Run your own instance (self-host)

Allowed under the [Sustainable Use License](LICENSE-SUL.md) for personal use or your organization’s
internal use. You need:

- an AWS account on a paid plan (Nitro Enclaves are not available on free-tier instance types), with the AWS CLI configured;
- a Linux server with Node.js 24, Docker, nginx and a domain with HTTPS;
- Python 3 on the machine that builds images (`infra/` scripts use the AWS CLI).

```bash
git clone https://github.com/spectre-systems/wisp-saas && cd wisp-saas

# 1. AWS resources: artifact bucket, host + builder roles, security group with no inbound ports
AWS_PROFILE=myprofile infra/setup.sh > server/.env.aws

# 2. Build the enclave image on a throwaway EC2 builder; prints PCR0 and adds it to mcp/pcrs.json
AWS_PROFILE=myprofile ARTIFACT_BUCKET=<from step 1> infra/build-eif.sh

# 3. Server config
cp server/.env.example server/.env && cat server/.env.aws >> server/.env   # then edit PUBLIC_URL etc.
(cd server && npm ci) && (cd web && npm ci && npx vite build)

# 4. Run it (put nginx with TLS in front of port 4800)
cd server && node --env-file=.env src/index.ts

# 5. Point the MCP at your server
claude mcp add --scope user ramwisp -e WISP_API=https://your-domain.example -- npx -y ramwisp@latest
```

The first account created on a fresh database becomes the admin (`/admin`). Optional card top-ups:
put `STRIPE_SECRET_KEY` in `server/.env` and run `infra/stripe-setup.sh`.

**Local development without AWS:** set `LAUNCHER=local` and build the dev image
(`docker build -t wisp-enclave:dev enclave`). Each job then runs the enclave as a network-less Docker
container with an emulated attestation; point the MCP at it with `WISP_API=http://127.0.0.1:4800` and
`WISP_DEV_ROOT=/tmp/wisp-dev/devroot.pem`.

## Verifying the enclave image

`mcp/pcrs.json` lists the PCR0 values the MCP accepts. To check that a published hash really corresponds
to this source, rebuild the image with `infra/build-eif.sh` at the listed commit and compare PCR0.
Note: the image installs pinned versions of Claude Code, Codex and Debian packages; fully bit-for-bit
reproducible builds are still being worked on.

## Security

Report vulnerabilities privately to Spectre Systems rather than in a public issue. See also
https://ramwisp.com/transparencia for the attestation details and what remains visible to the operator.

## License

- `mcp/` and `enclave/`: [Apache License 2.0](mcp/LICENSE).
- Everything else: [ramwisp Sustainable Use License](LICENSE-SUL.md) — free for personal and internal
  business use; no selling it or offering it as a service to third parties.
- Contributions: [CLA](CLA.md). The name “ramwisp” and its logos are trademarks of Spectre Systems.
