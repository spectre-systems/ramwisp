import { useEffect, useState } from 'react'
import { api, type PublicInfo } from '../api'
import { Footer, Nav } from '../components/Chrome'
import { CopyCommand, Reveal } from '../components/ui'

const ROOT_FP = '64:1A:03:21:A3:E2:44:EF:E4:56:46:31:95:D6:06:31:7E:D7:CD:CC:3C:17:56:E0:98:93:F3:C6:8F:79:BB:5B'

export default function Security() {
  const [info, setInfo] = useState<PublicInfo | null>(null)
  useEffect(() => { api<PublicInfo>('GET', '/api/public/info').then(setInfo).catch(() => {}) }, [])
  const pcrs = info?.pcrs?.pcr0 ?? []
  return (
    <div className="px-page">

      <Nav />
      <section className="section" style={{ paddingTop: 150 }}>
        <div className="wrap" style={{ maxWidth: 860 }}>
          <Reveal>
            <span className="eyebrow">transparency</span>
            <h1 className="h2">How we prove <span className="serif grad" style={{ fontStyle: 'italic' }}>we see nothing.</span></h1>
            <p className="lead muted">Everything your MCP checks before sending the task and your login — and what still depends on trust.</p>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 36 }}>
              <h3 style={{ marginTop: 0 }}>1. The root of trust belongs to AWS, not us</h3>
              <p className="muted">The attestation document is signed by the hardware’s Nitro Security Module, in a chain that ends at the public <em>AWS Nitro Enclaves Root G1</em>. The MCP ships with that root built in and compares it byte by byte.</p>
              <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>Root certificate SHA-256</div>
              <code className="mono" style={{ wordBreak: 'break-all', fontSize: 12.5 }}>{ROOT_FP}</code>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>2. The code that runs is the published code</h3>
              <p className="muted">PCR0 is the SHA-384 hash of the entire enclave image. The MCP only accepts the values below, which ship inside the package itself. An enclave in debug mode (all-zero PCR0) is always refused.</p>
              {pcrs.length === 0
                ? <p className="faint">No production image published yet.</p>
                : pcrs.map((p) => <div key={p} style={{ marginTop: 8 }}><CopyCommand cmd={p} prompt="PCR0" /></div>)}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>3. The key only exists inside the enclave</h3>
              <p className="muted">For every subagent, the enclave generates an X25519 key pair that never leaves its memory, and puts the public key inside the signed document along with a random nonce of yours (anti-replay). The MCP encrypts the task and the credential with ChaCha20-Poly1305 to that key. Our server only stores and relays encrypted bytes.</p>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>4. Access token only, never the refresh token</h3>
              <p className="muted">When you use your Claude Code or Codex login, the MCP only sends the access token, which expires on its own. The task time limit is trimmed to fit its validity. Your local session is never refreshed or logged out by us.</p>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>What stays visible, and what depends on trust</h3>
              <ul className="muted" style={{ paddingLeft: 18, display: 'grid', gap: 6 }}>
                <li>Metadata: time, duration, RAM, cost, exit code and the domains reached (network traffic goes through the host machine, which only sees the hostname and port; TLS is end-to-end from inside the enclave).</li>
                <li>You trust the AWS Nitro hardware and PKI.</li>
                <li>You trust the MCP package you installed: it is what verifies the attestation. The accepted hashes are in it and on this page.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
      <Footer />
    </div>
  )
}
