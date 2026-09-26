import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, codexToml, installCmd, type PublicInfo } from '../api'
import { Footer, Nav } from '../components/Chrome'
import { HeroStory } from '../components/HeroStory'
import { ControlPreview, Evaporate, KeyVault, TerminalDemo } from '../components/Sections'
import { CopyCommand, Reveal } from '../components/ui'

const ease = [0.16, 1, 0.3, 1] as const

/** Cada seção responde a UMA pergunta do visitante (roteiro em docs/landing-roteiro.md). */
function Q({ n, q }: { n: string; q: string }) {
  return <span className="eyebrow"><span className="mono">{n}</span>&nbsp;{q}</span>
}

export default function Landing() {
  const [info, setInfo] = useState<PublicInfo | null>(null)
  useEffect(() => { api<PublicInfo>('GET', '/api/public/info').then(setInfo).catch(() => {}) }, [])
  const gift = (info?.signup_credit_cents ?? 300) / 100
  const small = info?.instance_types[0]
  const big = info?.instance_types[1]
  const brl = (usd?: number) => (usd ? `US$ ${usd.toFixed(2).replace('.', ',')}` : '—')

  return (
    <div className="grain">
      <Nav />

      {/* 1 · O que é isso? É comigo? — problema e solução na primeira tela */}
      <section className="hero2">
        <div className="wrap hero2-grid">
          <div>
            <motion.span className="eyebrow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
              para quem roda subagentes no Claude Code e no Codex
            </motion.span>
            <h1>
              <motion.span className="problem" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease }}>
                Seus subagentes não cabem na sua RAM.
              </motion.span>
              <motion.span className="solution grad" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25, ease }}>
                Dê uma máquina para cada um.
              </motion.span>
            </h1>
            <motion.p className="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.45 }}>
              O ramwisp sobe cada subagente numa <b>máquina própria na nuvem</b>, com uma cópia do seu projeto e a RAM que ele precisar.
              Você recebe a resposta e as mudanças prontas para aplicar. A máquina <b>evapora</b> em seguida.
            </motion.p>
            <motion.div className="facts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              <span><b>US$ {gift.toFixed(0)}</b> grátis para testar</span>
              <span><b>{brl(small?.usdHour)}</b>/hora por máquina</span>
              <span>sobe em <b>~2–3 min</b></span>
              <span>tokens na <b>sua</b> assinatura ou chave</span>
            </motion.div>
            <motion.div className="hero-cta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, ease }}>
              <Link className="btn primary lg" to="/criar-conta">Testar grátis</Link>
              <a className="btn lg" href="#dia-a-dia">Ver um exemplo real</a>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.3, ease }}>
            <HeroStory />
          </motion.div>
        </div>
      </section>

      {/* 2 · Como eu usaria no dia a dia? */}
      <section id="dia-a-dia" className="section">
        <div className="wrap split">
          <Reveal>
            <Q n="01" q="como fica no seu dia a dia" />
            <h2 className="h2">Você pede em português. <span className="grad">Ele divide o trabalho.</span></h2>
            <ul className="bullets">
              <li><b>Você continua no seu terminal.</b> O ramwisp é um MCP: o seu Claude Code ou Codex ganha a ferramenta de subir subagentes e decide quando usar.</li>
              <li><b>O projeto vai junto.</b> Uma cópia cifrada do repositório, só com o que o git rastreia. O que está no <code>.gitignore</code>, como o <code>.env</code>, nunca sai.</li>
              <li><b>Volta pronto para revisar.</b> Cada subagente devolve a resposta e um patch. Você, ou o seu agente, aplica com <code>git apply</code>.</li>
            </ul>
          </Reveal>
          <Reveal delay={0.1}><TerminalDemo /></Reveal>
        </div>
      </section>

      {/* 3 · E a minha chave? Vocês veem? */}
      <section id="privacidade" className="section">
        <div className="wrap">
          <Reveal>
            <Q n="02" q="e a sua chave?" />
            <h2 className="h2">Sua chave viaja trancada. <span className="grad">Nem nós conseguimos abrir.</span></h2>
            <p className="lead muted">
              Cada subagente roda numa <b>máquina lacrada</b> (AWS Nitro Enclave). Antes de mandar qualquer coisa, o MCP confere no
              seu computador uma prova assinada pelo hardware de que a máquina roda exatamente o código publicado. Só então tranca
              o seu login, o projeto e a tarefa com uma chave que existe apenas dentro dela.
            </p>
          </Reveal>
          <Reveal delay={0.1}><KeyVault /></Reveal>
          <Reveal delay={0.15}>
            <div className="grid-3 trust3">
              <div><b>Só o token de acesso</b><p className="muted small">O de renovação nunca sai do seu computador. O acesso expira sozinho e a sua sessão local nunca cai.</p></div>
              <div><b>Mudou o código, o MCP recusa</b><p className="muted small">Se alguém trocar o software da máquina, a prova deixa de bater e nada é enviado. <Link to="/seguranca" style={{ color: 'var(--wisp)' }}>Como conferimos</Link>.</p></div>
              <div><b>O que nós vemos</b><p className="muted small">Só o que aparece no seu painel: horário, duração, RAM, custo e os domínios acessados. Nunca o conteúdo.</p></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 4 · E depois? Fica alguma coisa? */}
      <section className="section">
        <div className="wrap split reverse">
          <Reveal delay={0.1}><Evaporate /></Reveal>
          <Reveal>
            <Q n="03" q="e quando termina?" />
            <h2 className="h2">Entregou, <span className="grad">evaporou.</span></h2>
            <p className="lead muted">
              Não existe máquina parada com a sua chave dentro. Assim que você recebe o resultado, a máquina é destruída junto com a memória.
              Se você esquecer um subagente rodando, ele evapora sozinho no tempo máximo da tarefa.
            </p>
          </Reveal>
        </div>
      </section>

      {/* 5 · Quem controla? Quanto vou gastar? */}
      <section id="precos" className="section">
        <div className="wrap split">
          <Reveal>
            <Q n="04" q="quem controla e quanto custa" />
            <h2 className="h2">Você vê cada um. <span className="grad">Você desliga quando quiser.</span></h2>
            <ul className="bullets">
              <li><b>Painel ao vivo:</b> cada subagente com a RAM em tempo real e um botão para encerrar.</li>
              <li><b>Nunca passa do seu saldo:</b> cada subagente reserva o máximo que pode custar e devolve a sobra ao terminar.</li>
              <li><b>Tempo máximo por tarefa:</b> 30 min por padrão, até 2 h.</li>
              <li><b>O modelo é seu:</b> os tokens saem da sua assinatura ou chave, como numa sessão normal. 4 subagentes em paralelo gastam como 4 sessões.</li>
            </ul>
            <div className="price-table">
              <div><span>Subagente com até <b>8 GB</b> de RAM</span><b>{brl(small?.usdHour)}/h</b></div>
              <div><span>Subagente com até <b>24 GB</b> de RAM</span><b>{brl(big?.usdHour)}/h</b></div>
              <p className="faint small">Você paga pela máquina, cobrada por segundo (mínimo de 60 s). Uma tarefa de 10 min com 8 GB custa cerca de {brl((small?.usdHour ?? 0.2) / 6)}.</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}><ControlPreview /></Reveal>
        </div>
      </section>

      {/* 6 · Como começo? */}
      <section id="comecar" className="section">
        <div className="wrap" style={{ maxWidth: 860 }}>
          <Reveal>
            <Q n="05" q="como começar" />
            <h2 className="h2">Um comando. <span className="grad">Um clique no navegador.</span></h2>
          </Reveal>
          <Reveal delay={0.05}>
            <ol className="start">
              <li><b>Adicione o MCP</b> no Claude Code:<CopyCommand cmd={installCmd()} />
                <details className="codex-details"><summary>Usa Codex? Veja o trecho para o <code>~/.codex/config.toml</code></summary><pre className="block mono">{codexToml()}</pre></details>
              </li>
              <li><b>Na primeira vez, ele abre o navegador</b> para você criar a conta ramwisp (com US$ {gift.toFixed(0)} grátis) ou entrar. É só aprovar.</li>
              <li><b>Peça ao seu agente:</b> <em>“roda isso num subagente wisp com 8 GB”</em>. Ele faz o resto.</li>
            </ol>
          </Reveal>
        </div>
      </section>

      {/* 7 · Objeções que sobraram */}
      <section className="section">
        <div className="wrap faq">
          <Reveal><Q n="06" q="perguntas" /><h2 className="h2">Antes de testar</h2></Reveal>
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} delay={i * 0.03}>
              <details className="faq-item"><summary>{q}</summary><p className="muted">{a}</p></details>
            </Reveal>
          ))}
          <Reveal>
            <div className="card glow gift" style={{ marginTop: 40 }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>US$ {gift.toFixed(0)} grátis, sem cartão</div>
                <p className="muted" style={{ margin: '6px 0 0' }}>Dá para cerca de {Math.floor(gift / (small?.usdHour ?? 0.2))} horas de máquina com 8 GB.</p>
              </div>
              <Link className="btn primary lg" to="/criar-conta">Criar conta</Link>
            </div>
          </Reveal>
        </div>
      </section>
      <Footer />
    </div>
  )
}

const FAQ: [string, string][] = [
  ['O que a máquina tem instalado?', 'Claude Code, Codex, git, Python 3 e curl. O subagente tem internet (HTTPS) e pode instalar o que precisar com pip ou npm, como faria no seu computador.'],
  ['Meu código fica guardado em algum lugar?', 'Não. A cópia vai cifrada direto para dentro da máquina lacrada, e o nosso servidor só guarda bytes ilegíveis até a máquina buscar. Depois de rodar, a máquina é destruída com tudo o que tinha em memória.'],
  ['Por que demora 2–3 minutos para começar?', 'É uma máquina nova, só sua, criada para a tarefa. Por isso o ramwisp vale para trabalhos de minutos a horas, em paralelo: suítes de teste, refatorações, pesquisa longa.'],
  ['Posso usar o meu login do Claude ou do ChatGPT?', 'Sim, para uso pessoal: o MCP usa o login que já está no seu computador (só o token de acesso). Para uso comercial ou em equipe, use uma chave de API: é só colocar ANTHROPIC_API_KEY ou OPENAI_API_KEY no env do MCP.'],
  ['E se eu esquecer um subagente rodando?', 'Toda tarefa tem tempo máximo. Passou dele, a máquina é destruída e você paga só o tempo usado. A reserva de crédito volta na hora.'],
  ['Como vocês provam que não trocaram o código?', 'O hardware da AWS assina o hash exato do software que está rodando. O MCP compara com o hash publicado e, se não bater, não envia nada. Os hashes estão na página de transparência.'],
]
