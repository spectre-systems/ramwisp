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
            <span className="eyebrow">transparência</span>
            <h1 className="h2">Como provamos que <span className="serif grad" style={{ fontStyle: 'italic' }}>não vemos nada.</span></h1>
            <p className="lead muted">Tudo o que o seu MCP confere antes de mandar a missão e o seu login, e o que ainda depende de confiança.</p>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 36 }}>
              <h3 style={{ marginTop: 0 }}>1. A raiz de confiança é da AWS, não nossa</h3>
              <p className="muted">O documento de atestação é assinado pelo Nitro Security Module do hardware, numa cadeia que termina na raiz pública <em>AWS Nitro Enclaves Root G1</em>. O MCP traz essa raiz embutida e compara byte a byte.</p>
              <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>SHA-256 do certificado raiz</div>
              <code className="mono" style={{ wordBreak: 'break-all', fontSize: 12.5 }}>{ROOT_FP}</code>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>2. O código que roda é o código publicado</h3>
              <p className="muted">O PCR0 é o hash SHA-384 da imagem inteira da enclave. O MCP só aceita os valores abaixo, que vêm embutidos no próprio pacote. Uma enclave em modo debug (PCR0 zerado) é recusada sempre.</p>
              {pcrs.length === 0
                ? <p className="faint">Nenhuma imagem de produção publicada ainda.</p>
                : pcrs.map((p) => <div key={p} style={{ marginTop: 8 }}><CopyCommand cmd={p} prompt="PCR0" /></div>)}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>3. A chave existe só dentro da enclave</h3>
              <p className="muted">A cada subagente, a enclave gera um par X25519 que nunca sai da memória dela, e coloca a chave pública dentro do documento assinado junto com um número aleatório seu (anti-repetição). O MCP cifra missão e credencial com ChaCha20-Poly1305 para essa chave. O nosso servidor só guarda e repassa bytes cifrados.</p>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>4. Só o token de acesso, nunca o de renovação</h3>
              <p className="muted">Quando você usa o seu login do Claude Code ou do Codex, o MCP manda só o token de acesso, que expira sozinho. O tempo máximo da missão é cortado para caber na validade dele. A sua sessão local nunca é renovada nem derrubada por nós.</p>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>O que continua visível e o que depende de confiança</h3>
              <ul className="muted" style={{ paddingLeft: 18, display: 'grid', gap: 6 }}>
                <li>Metadados: horário, duração, RAM, custo, código de saída e os domínios acessados (a saída de rede passa pela máquina hospedeira, que vê só o nome e a porta; o TLS é de ponta a ponta de dentro da enclave).</li>
                <li>Você confia no hardware e na PKI da AWS Nitro.</li>
                <li>Você confia no pacote do MCP que instalou: é ele quem confere a atestação. Os hashes aceitos estão nele e nesta página.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
      <Footer />
    </div>
  )
}
