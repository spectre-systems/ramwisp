import { motion, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, codexToml, installCmd, type PublicInfo } from '../api'
import { Footer, Nav } from '../components/Chrome'
import { Flow } from '../components/Flow'
import { WispField } from '../components/WispField'
import { CopyCommand, CountUp, Reveal } from '../components/ui'

const ease = [0.16, 1, 0.3, 1] as const

export default function Landing() {
  const [info, setInfo] = useState<PublicInfo | null>(null)
  useEffect(() => { api<PublicInfo>('GET', '/api/public/info').then(setInfo).catch(() => {}) }, [])
  const hero = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120])
  const heroO = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const gift = (info?.signup_credit_cents ?? 300) / 100

  return (
    <div className="grain">
      <Nav />

      {/* ------------------------------------------------ herói */}
      <section className="hero" ref={hero}>
        <WispField />
        <div className="hero-fade" />
        <motion.div className="wrap hero-in" style={{ y: heroY, opacity: heroO }}>
          <motion.span className="eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}>
            subagentes efêmeros · Claude Code &amp; Codex
          </motion.span>
          <h1 className="hero-title">
            {['RAM', 'sob', 'demanda', 'para', 'os', 'seus'].map((w, i) => (
              <motion.span key={i} className="word" initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1, delay: 0.1 + i * 0.06, ease }}>{w}&nbsp;</motion.span>
            ))}
            <motion.span className="word serif grad" style={{ fontStyle: 'italic' }} initial={{ opacity: 0, y: 40, filter: 'blur(14px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 1.3, delay: 0.5, ease }}>subagentes.</motion.span>
          </h1>
          <motion.p className="hero-sub" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.7, ease }}>
            Cada subagente nasce numa máquina própria na nuvem, trabalha, entrega a resposta e desaparece.
            Com a <em>sua</em> assinatura ou chave — e protegido de um jeito que nem nós conseguimos ver o que ele faz.
          </motion.p>
          <motion.div className="hero-cta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.85, ease }}>
            <Link className="btn primary lg" to="/criar-conta">Começar com US$ {gift.toFixed(0)} grátis</Link>
            <a className="btn lg" href="#como">Ver como funciona</a>
          </motion.div>
          <motion.div className="hero-cmd" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 1, ease }}>
            <CopyCommand cmd={installCmd()} />
            <span className="faint" style={{ fontSize: 13 }}>Um comando. No primeiro uso, ele abre o navegador para você entrar.</span>
          </motion.div>
        </motion.div>
        <motion.a href="#respira" className="scroll-hint" animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} aria-label="Rolar">
          <span />
        </motion.a>
      </section>

      {/* ------------------------------------------------ seu computador respira */}
      <section id="respira" className="section">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">o problema</span>
            <h2 className="h2">Seis agentes em paralelo não cabem<br /><span className="serif grad" style={{ fontStyle: 'italic' }}>no seu notebook.</span></h2>
            <p className="lead muted">Cada subagente carrega ferramentas, builds, testes, navegadores. Tudo disputando RAM com o que você está fazendo — até a máquina travar.</p>
          </Reveal>
          <div className="grid-2" style={{ marginTop: 40 }}>
            <Reveal delay={0.05}><Breathe mode="local" /></Reveal>
            <Reveal delay={0.15}><Breathe mode="wisp" /></Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ como funciona */}
      <section id="como" className="section">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">como funciona</span>
            <h2 className="h2">Pedir. Provar. Selar.<br /><span className="serif grad" style={{ fontStyle: 'italic' }}>Evaporar.</span></h2>
          </Reveal>
          <Reveal delay={0.1}><Flow /></Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ privacidade */}
      <section id="privacidade" className="section">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">privacidade de verdade</span>
            <h2 className="h2">Não é uma promessa.<br /><span className="serif grad" style={{ fontStyle: 'italic' }}>É matemática.</span></h2>
            <p className="lead muted">
              O agente roda dentro de uma AWS Nitro Enclave: memória isolada, sem disco, sem acesso nem para quem é dono da conta.
              O seu MCP só manda algo depois de conferir a assinatura do hardware e o hash do código. Se mudarmos uma vírgula, ele recusa.
            </p>
          </Reveal>
          <div className="grid-2 see" style={{ marginTop: 40 }}>
            <Reveal delay={0.05}>
              <div className="card">
                <h3 className="see-h"><span className="dot" style={{ background: 'var(--err)' }} />O que nunca vemos</h3>
                <ul className="see-list">
                  {['A missão que você mandou', 'O seu login do Claude ou do ChatGPT, ou a sua chave de API', 'O que o agente escreveu, rodou ou baixou', 'A resposta final'].map((t, i) => (
                    <motion.li key={t} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.08 }}>
                      <LockIcon /> {t}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="card">
                <h3 className="see-h"><span className="dot" style={{ background: 'var(--ok)' }} />O que vemos (e mostramos no seu painel)</h3>
                <ul className="see-list">
                  {['Quando começou, quanto durou e quanto custou', 'Quanta RAM foi usada, em tempo real', 'Os domínios acessados (ex.: api.anthropic.com), nunca o conteúdo', 'Se terminou com sucesso ou erro'].map((t, i) => (
                    <motion.li key={t} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.08 }}>
                      <EyeIcon /> {t}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <p className="faint" style={{ marginTop: 18, fontSize: 14 }}>
              Os hashes aceitos e a raiz de confiança estão em <Link to="/seguranca" style={{ color: 'var(--wisp)' }}>Transparência</Link>.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ setup */}
      <section className="section">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">em 30 segundos</span>
            <h2 className="h2">Adicione. Peça. <span className="serif grad" style={{ fontStyle: 'italic' }}>Pronto.</span></h2>
          </Reveal>
          <div className="grid-3 steps3" style={{ marginTop: 36 }}>
            <Reveal delay={0.0}><Step n="1" t="Adicione o MCP" d="No Claude Code ou no Codex. Nada para configurar."><CopyCommand cmd={installCmd()} /></Step></Reveal>
            <Reveal delay={0.08}><Step n="2" t="Entre no navegador" d="No primeiro uso ele abre uma página. Você aprova e ganha crédito grátis."><div className="code-chip mono">código <b>WQ7K-L2PD</b> · aprovar</div></Step></Reveal>
            <Reveal delay={0.16}><Step n="3" t="Peça em linguagem normal" d="O seu agente passa a delegar trabalho pesado sozinho."><div className="code-chip">“sobe 4 subagentes com 8 GB e roda os testes de cada pacote”</div></Step></Reveal>
          </div>
          <Reveal delay={0.1}>
            <details className="codex-details">
              <summary>Usa Codex? Adicione em <code>~/.codex/config.toml</code></summary>
              <pre className="block mono">{codexToml()}</pre>
            </details>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ preços */}
      <section id="precos" className="section">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">preço</span>
            <h2 className="h2">Paga a máquina pelo segundo.<br /><span className="serif grad" style={{ fontStyle: 'italic' }}>O modelo é seu.</span></h2>
            <p className="lead muted">O wisp cobra só o tempo de máquina. O modelo roda na sua assinatura Claude/ChatGPT ou na sua chave de API — como uma sessão normal.</p>
          </Reveal>
          <div className="tiers">
            {(info?.tiers ?? [2, 4, 8, 16, 24]).map((gb, i) => {
              const it = info?.instance_types.find((t) => t.memMib - 2560 >= gb * 1024 + 3072)
              return (
                <Reveal key={gb} delay={i * 0.05}>
                  <div className={`card tier ${gb === 8 ? 'glow' : ''}`}>
                    <div className="tier-gb"><CountUp value={gb} /> <span>GB</span></div>
                    <div className="muted">RAM do subagente</div>
                    <div className="tier-price">{it ? `US$ ${it.usdHour.toFixed(2).replace('.', ',')}` : '—'}<span className="faint"> /hora</span></div>
                    <div className="faint" style={{ fontSize: 12 }}>{it ? `≈ US$ ${(it.usdHour / 6).toFixed(3).replace('.', ',')} por 10 min` : ''}</div>
                  </div>
                </Reveal>
              )
            })}
          </div>
          <Reveal delay={0.1}>
            <div className="card glow gift">
              <div>
                <div className="serif" style={{ fontSize: 34, lineHeight: 1.1 }}>US$ {gift.toFixed(0)} de crédito para começar</div>
                <p className="muted" style={{ margin: '8px 0 0' }}>Sem cartão. Dá para dezenas de subagentes de 10 minutos. Cobrança por segundo, mínimo de 60 s por máquina.</p>
              </div>
              <Link className="btn primary lg" to="/criar-conta">Criar conta</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ FAQ */}
      <section className="section">
        <div className="wrap faq">
          <Reveal><span className="eyebrow">perguntas</span><h2 className="h2">Perguntas frequentes</h2></Reveal>
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} delay={i * 0.04}>
              <details className="faq-item"><summary>{q}</summary><p className="muted">{a}</p></details>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section final">
        <WispField density={0.5} />
        <div className="wrap" style={{ position: 'relative', textAlign: 'center' }}>
          <Reveal>
            <h2 className="h2" style={{ marginInline: 'auto' }}>Deixe o peso <span className="serif grad" style={{ fontStyle: 'italic' }}>evaporar.</span></h2>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
              <Link className="btn primary lg" to="/criar-conta">Começar grátis</Link>
              <Link className="btn lg" to="/seguranca">Ler sobre segurança</Link>
            </div>
          </Reveal>
        </div>
      </section>
      <Footer />
    </div>
  )
}

const FAQ: [string, string][] = [
  ['Preciso instalar alguma coisa?', 'Só o MCP, com um comando. Ele usa o Node que você já tem (npx) e não precisa de mais nada. Não roda nenhum serviço em segundo plano.'],
  ['Qual login o agente usa?', 'Você escolhe. Por padrão, o seu login do Claude Code ou do Codex desta máquina (só o token de acesso, nunca o de renovação, então sua sessão local nunca cai). Se preferir, uma chave de API no env do MCP.'],
  ['O agente vê meus arquivos?', 'Não. Ele começa numa máquina vazia, sem seus arquivos, sem chave SSH e sem credenciais de git. Tudo o que ele sabe vai na missão. Ele tem internet (HTTPS).'],
  ['Quanto tempo leva para subir?', 'Cerca de 2 a 3 minutos para ligar uma máquina nova e provar a enclave. Por isso o wisp brilha em tarefas de minutos a horas, em paralelo.'],
  ['E se eu esquecer um agente rodando?', 'Cada missão tem um tempo máximo. Passou dele, a máquina é destruída sozinha, e você só paga o tempo usado. A reserva de crédito volta na hora.'],
  ['Como sei que vocês não trocam o código?', 'O hardware da AWS assina o hash exato da imagem que está rodando. Seu MCP compara com a lista publicada e, se não bater, não manda nada. Os hashes estão na página de transparência.'],
]

function Breathe({ mode }: { mode: 'local' | 'wisp' }) {
  const local = mode === 'local'
  const agents = 6
  return (
    <div className={`card breathe ${local ? '' : 'glow'}`}>
      <div className="breathe-h">
        <strong>{local ? 'Sem wisp' : 'Com wisp'}</strong>
        <span className={`pill ${local ? 'err' : 'ok'}`}><span className="dot" />{local ? 'RAM 97%' : 'RAM 31%'}</span>
      </div>
      <div className="breathe-ram">
        <span className="faint mono" style={{ fontSize: 12 }}>seu computador · 16 GB</span>
        <div className="ram-track">
          <motion.div className="ram-you" initial={{ width: 0 }} whileInView={{ width: '28%' }} viewport={{ once: true }} transition={{ duration: 1 }} />
          {local && Array.from({ length: agents }).map((_, i) => (
            <motion.div key={i} className="ram-agent" initial={{ width: 0 }} whileInView={{ width: '11.5%' }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.6 + i * 0.18 }} />
          ))}
        </div>
      </div>
      {!local && (
        <div className="cloud-agents">
          {Array.from({ length: agents }).map((_, i) => (
            <motion.div key={i} className="cloud-agent" initial={{ opacity: 0, y: 20, scale: 0.8 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.5 + i * 0.12, ease }}>
              <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.6, delay: i * 0.3 }}>◌</motion.span>
              <span className="mono faint" style={{ fontSize: 11 }}>8 GB</span>
            </motion.div>
          ))}
        </div>
      )}
      <p className="muted" style={{ margin: '14px 0 0', fontSize: 14 }}>
        {local ? 'Swap, ventoinha no máximo, seu editor travando entre um teste e outro.' : 'Seis agentes com 8 GB cada, cada um na sua máquina. O seu notebook nem percebe.'}
      </p>
    </div>
  )
}

function Step({ n, t, d, children }: { n: string; t: string; d: string; children: React.ReactNode }) {
  return (
    <div className="card step">
      <span className="step-n serif grad">{n}</span>
      <h3 style={{ margin: '4px 0 6px', fontSize: 18 }}>{t}</h3>
      <p className="muted" style={{ margin: '0 0 16px', fontSize: 14 }}>{d}</p>
      {children}
    </div>
  )
}

const LockIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--err)" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
const EyeIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
