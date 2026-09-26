import { motion, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, codexToml, installCmd, type PublicInfo } from '../api'
import { Footer, Nav } from '../components/Chrome'
import { LiquidBg } from '../components/LiquidBg'
import { LiquidGhost } from '../components/LiquidGhost'
import { RamJar } from '../components/RamJar'
import { ControlPreview, Evaporate, KeyVault, TerminalDemo } from '../components/Sections'
import { CopyCommand, Reveal } from '../components/ui'

const ease = [0.16, 1, 0.3, 1] as const

/** Cada seção responde a UMA pergunta do visitante (roteiro em docs/landing-roteiro.md). */
function Q({ n, q }: { n: string; q: string }) {
  return <span className="eyebrow"><span className="mono">{n}</span>&nbsp;{q}</span>
}

/** Botão que puxa o cursor (e é puxado por ele) — convida ao clique principal. */
function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const x = useSpring(useMotionValue(0), { stiffness: 250, damping: 15 })
  const y = useSpring(useMotionValue(0), { stiffness: 250, damping: 15 })
  return (
    <motion.span ref={ref} className="magnetic" style={{ x, y }}
      onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * 0.35); y.set((e.clientY - r.top - r.height / 2) * 0.35) }}
      onPointerLeave={() => { x.set(0); y.set(0) }}>
      {children}
    </motion.span>
  )
}

/** Palavras gigantes subindo uma a uma. */
function Kinetic({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="kw"><motion.span initial={{ y: '110%' }} animate={{ y: '0%' }} transition={{ duration: 0.9, delay: delay + i * 0.07, ease }}>{w}</motion.span></span>
      ))}
    </span>
  )
}

/** Fantasma grande do final que segue o cursor. */
function FollowGhost() {
  const x = useSpring(useMotionValue(0), { stiffness: 60, damping: 12 })
  const y = useSpring(useMotionValue(0), { stiffness: 60, damping: 12 })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect(); if (!r) return
      x.set(Math.max(-220, Math.min(220, (e.clientX - r.left - r.width / 2) * 0.25)))
      y.set(Math.max(-60, Math.min(60, (e.clientY - r.top - r.height / 2) * 0.2)))
    }
    window.addEventListener('pointermove', on); return () => window.removeEventListener('pointermove', on)
  }, [x, y])
  return <div ref={box} className="follow-ghost"><motion.div style={{ x, y }}><LiquidGhost mood="happy" size={170} /></motion.div></div>
}

export default function Landing() {
  const [info, setInfo] = useState<PublicInfo | null>(null)
  useEffect(() => { api<PublicInfo>('GET', '/api/public/info').then(setInfo).catch(() => {}) }, [])
  const gift = (info?.signup_credit_cents ?? 300) / 100
  const small = info?.instance_types[0]
  const big = info?.instance_types[1]
  const usd = (v?: number) => (v ? `US$ ${v.toFixed(2).replace('.', ',')}` : '—')

  return (
    <div className="liquid-page">
      <LiquidBg />
      <Nav />

      {/* 1 · O que é isso? É comigo? — problema e solução, e um brinquedo que faz a pessoa sentir os dois */}
      <section className="lhero">
        <div className="wrap lhero-grid">
          <div className="lhero-copy">
            <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>para quem roda subagentes no Claude Code e no Codex</motion.span>
            <h1 className="mega">
              <Kinetic text="Seus subagentes não cabem na sua" />
              <span className="kw"><motion.span className="ram-pill" initial={{ y: '110%', rotate: -8 }} animate={{ y: '0%', rotate: -4 }} transition={{ duration: 0.9, delay: 0.45, ease }}>RAM.</motion.span></span>
            </h1>
            <p className="mega-sub"><Kinetic text="Dê uma máquina para" delay={0.6} /><Kinetic className="serif grad" text="cada um." delay={0.85} /></p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 1, ease }}>
              <p className="lead">
                O ramwisp sobe cada subagente numa <b>máquina própria na nuvem</b>, com uma cópia do seu projeto e a RAM que ele precisar.
                Você recebe a resposta e as mudanças prontas. A máquina <b>evapora</b> em seguida.
              </p>
              <div className="facts">
                <span><b>US$ {gift.toFixed(0)}</b> grátis</span>
                <span><b>{usd(small?.usdHour)}</b>/h por máquina</span>
                <span>sobe em <b>~2–3 min</b></span>
                <span>tokens na <b>sua</b> assinatura</span>
              </div>
              <div className="hero-cta">
                <Magnetic><Link className="btn primary lg jelly" to="/criar-conta">Testar grátis →</Link></Magnetic>
                <a className="btn lg" href="#dia-a-dia">Como funciona</a>
              </div>
            </motion.div>
          </div>
          <motion.div className="card glass jar-card" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.5, ease }}>
            <span className="try-me">experimente ↓</span>
            <RamJar />
          </motion.div>
        </div>
      </section>

      {/* o que come a RAM: faixa rolando */}
      <div className="marquee" aria-label="O que os subagentes fazem que pesa">
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k}>{['testes em paralelo', 'builds pesados', 'navegador headless', 'refatorações grandes', 'pesquisa longa', 'monorepos'].map((t) => <span key={t}>{t}<i>✦</i></span>)}</span>
          ))}
        </div>
      </div>

      {/* 2 · Como eu usaria? */}
      <section id="dia-a-dia" className="section">
        <div className="wrap split">
          <Reveal>
            <Q n="01" q="como fica no seu dia a dia" />
            <h2 className="h2">Você pede.<br /><span className="serif grad">Quatro máquinas trabalham.</span></h2>
            <ul className="bullets">
              <li><b>Você continua no seu terminal.</b> O ramwisp é um MCP: o seu Claude Code ou Codex ganha a ferramenta de subir subagentes e decide quando usar.</li>
              <li><b>O projeto vai junto.</b> Uma cópia cifrada do repositório, só com o que o git rastreia. O <code>.env</code> e o resto do <code>.gitignore</code> nunca saem.</li>
              <li><b>Volta pronto para revisar.</b> Cada subagente devolve a resposta e um patch para <code>git apply</code>.</li>
            </ul>
          </Reveal>
          <Reveal delay={0.1}><TerminalDemo /></Reveal>
        </div>
      </section>

      {/* 3 · E a minha chave? */}
      <section id="privacidade" className="section">
        <div className="wrap">
          <Reveal>
            <Q n="02" q="e a sua chave?" />
            <h2 className="h2">Sua chave viaja trancada.<br /><span className="serif grad">Nem nós abrimos.</span></h2>
            <p className="lead muted">
              Cada subagente roda numa <b>máquina lacrada</b> (AWS Nitro Enclave). Antes de mandar qualquer coisa, o MCP confere no seu
              computador uma prova assinada pelo hardware de que a máquina roda exatamente o código publicado. Só então tranca
              o seu login, o projeto e a tarefa com uma chave que só existe dentro dela.
            </p>
          </Reveal>
          <Reveal delay={0.1}><KeyVault /></Reveal>
          <Reveal delay={0.1}>
            <div className="evap-row">
              <Evaporate />
              <div>
                <h3 className="h3">Entregou, <span className="serif grad">evaporou.</span></h3>
                <p className="muted">Não existe máquina parada com a sua chave dentro. Recebeu o resultado, a máquina é destruída com a memória. Esqueceu um subagente rodando? Ele evapora sozinho no tempo máximo da tarefa.</p>
                <p className="muted small">Só o token de acesso vai, nunca o de renovação. <Link to="/transparencia" style={{ color: 'var(--wisp)' }}>Como conferimos tudo isso →</Link></p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 4 · Quem controla? Quanto custa? */}
      <section id="precos" className="section">
        <div className="wrap split">
          <Reveal>
            <Q n="03" q="quem controla e quanto custa" />
            <h2 className="h2">Você vê cada um.<br /><span className="serif grad">E desliga quando quiser.</span></h2>
            <ul className="bullets">
              <li><b>Painel ao vivo</b> com a RAM de cada subagente e um botão para encerrar.</li>
              <li><b>Nunca passa do seu saldo:</b> cada um reserva o máximo que pode custar e devolve a sobra.</li>
              <li><b>Tempo máximo por tarefa:</b> 30 min por padrão, até 2 h.</li>
              <li><b>O modelo é seu:</b> tokens na sua assinatura ou chave. 4 subagentes gastam como 4 sessões.</li>
            </ul>
            <div className="price-table">
              <div><span>Subagente com até <b>8 GB</b></span><b>{usd(small?.usdHour)}/h</b></div>
              <div><span>Subagente com até <b>24 GB</b></span><b>{usd(big?.usdHour)}/h</b></div>
              <p className="faint small">Você paga a máquina, por segundo (mínimo de 60 s). 10 min com 8 GB ≈ {usd((small?.usdHour ?? 0.2) / 6)}.</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}><ControlPreview /></Reveal>
        </div>
      </section>

      {/* 5 · Como começo? */}
      <section id="comecar" className="section">
        <div className="wrap" style={{ maxWidth: 900 }}>
          <Reveal>
            <Q n="04" q="como começar" />
            <h2 className="h2">Um comando.<br /><span className="serif grad">Um clique.</span></h2>
          </Reveal>
          <Reveal delay={0.05}>
            <ol className="start">
              <li><b>Adicione o MCP</b> no Claude Code:<CopyCommand cmd={installCmd()} />
                <details className="codex-details"><summary>Usa Codex? Trecho para o <code>~/.codex/config.toml</code></summary><pre className="block mono">{codexToml()}</pre></details>
              </li>
              <li><b>Na primeira vez, ele abre o navegador</b> para você criar a conta (com US$ {gift.toFixed(0)} grátis) ou entrar. É só aprovar.</li>
              <li><b>Peça ao seu agente:</b> <em>“roda isso num subagente wisp com 8 GB”</em>.</li>
            </ol>
          </Reveal>
        </div>
      </section>

      {/* 6 · Objeções */}
      <section className="section">
        <div className="wrap faq">
          <Reveal><Q n="05" q="perguntas" /><h2 className="h2">Antes de testar</h2></Reveal>
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} delay={i * 0.03}><details className="faq-item"><summary>{q}</summary><p className="muted">{a}</p></details></Reveal>
          ))}
        </div>
      </section>

      {/* final: convite */}
      <section className="section final-cta">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <FollowGhost />
          <h2 className="mega" style={{ marginTop: 10 }}>Deixe sua RAM <span className="serif grad">em paz.</span></h2>
          <p className="muted" style={{ fontSize: 18 }}>US$ {gift.toFixed(0)} grátis, sem cartão. Cerca de {Math.floor(gift / (small?.usdHour ?? 0.2))} horas de máquina com 8 GB.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
            <Magnetic><Link className="btn primary lg jelly" to="/criar-conta">Criar conta →</Link></Magnetic>
            <Link className="btn lg" to="/transparencia">Transparência</Link>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}

const FAQ: [string, string][] = [
  ['Por que um subagente gasta tanta RAM?', 'O modelo roda na API, mas o que o subagente faz roda na máquina: instalar dependências, compilar, rodar a suíte de testes, abrir um navegador. É isso que come gigas, e é isso que vai para a máquina dele.'],
  ['O que a máquina tem instalado?', 'Claude Code, Codex, git, Python 3, Node.js e npm, curl. Tem internet (HTTPS) e pode instalar o que precisar com pip ou npm. Não tem Docker nem acesso à sua rede local.'],
  ['Meu código fica guardado em algum lugar?', 'Não. A cópia vai cifrada direto para dentro da máquina lacrada; o nosso servidor só guarda bytes ilegíveis até a máquina buscar. Depois de rodar, a máquina é destruída com tudo o que tinha em memória.'],
  ['O subagente pode dar commit ou push?', 'Não. Ele não recebe suas credenciais de git nem SSH. As mudanças voltam como patch e quem decide aplicar é você (ou o seu agente).'],
  ['Por que demora 2–3 minutos para começar?', 'É uma máquina nova, só sua, criada para a tarefa. Vale para trabalhos de minutos a horas, em paralelo.'],
  ['Posso usar o meu login do Claude ou do ChatGPT?', 'Sim, para uso pessoal: o MCP usa o login do seu computador (só o token de acesso). Para uso comercial ou em equipe, use uma chave de API (ANTHROPIC_API_KEY ou OPENAI_API_KEY no env do MCP).'],
  ['E se eu esquecer um subagente rodando?', 'Toda tarefa tem tempo máximo. Passou dele, a máquina é destruída e você paga só o tempo usado.'],
]
