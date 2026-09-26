import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, codexToml, installCmd, type PublicInfo } from '../api'
import { Footer, Nav } from '../components/Chrome'
import { GhostMark } from '../components/Mark'
import { ProductDemo } from '../components/ProductDemo'
import { BlockField } from '../components/BlockField'
import { IsoSteps } from '../components/IsoSteps'
import { CopyCommand, Reveal } from '../components/ui'
import '../landing.css'

const ease = [0.16, 1, 0.3, 1] as const

/** Instalação para quem usa Claude Code OU Codex: a pessoa escolhe a aba do agente que já usa. */
function InstallTabs() {
  const [tab, setTab] = useState<'claude' | 'codex'>('claude')
  return (
    <div className="itabs">
      <div className="itabs-bar mono" role="tablist">
        {(['claude', 'codex'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'claude' ? 'Claude Code' : 'Codex'}</button>
        ))}
        <span className="dim">{tab === 'claude' ? 'no terminal' : 'em ~/.codex/config.toml'}</span>
      </div>
      {tab === 'claude'
        ? <CopyCommand cmd={installCmd()} />
        : <CopyCommand cmd={codexToml()} prompt="" />}
    </div>
  )
}
const Tag = ({ children, acc }: { children: string; acc?: boolean }) => <span className={`tag mono ${acc ? 'acc' : ''}`}>[ {children} ]</span>

const SPECS: [string, string][] = [
  ['Onde roda', 'uma máquina por subagente · AWS Nitro Enclave'],
  ['Como chega', 'MCP no Claude Code ou Codex · spawn_agent()'],
  ['O projeto', 'cópia cifrada · git ls-files, sem o .gitignore'],
  ['O modelo', 'sua assinatura ou sua chave de API'],
  ['O resultado', 'resposta + patch para git apply'],
  ['O fim', 'máquina destruída ao entregar ou no timeout'],
]

export default function Landing() {
  const [info, setInfo] = useState<PublicInfo | null>(null)
  useEffect(() => { api<PublicInfo>('GET', '/api/public/info').then(setInfo).catch(() => {}) }, [])
  const gift = (info?.signup_credit_cents ?? 300) / 100
  const small = info?.instance_types[0]
  const big = info?.instance_types[1]
  const usd = (v?: number) => (v ? `US$ ${v.toFixed(2).replace('.', ',')}` : '—')

  return (
    <div className="pro">
      <Nav />

      {/* 1 · O que é isso? É comigo? */}
      <section className="hero-pro">
        <BlockField />
        <div className="wrap hero-pro-grid">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}>
            <Tag>RAM para subagentes</Tag>
            <h1 className="display">Seus subagentes<br />não cabem na<br /><span className="acc">sua RAM.</span></h1>
            <p className="hero-p">
              O ramwisp tira o trabalho pesado do seu notebook. Um comando no Claude Code ou no Codex e cada subagente roda numa
              máquina lacrada na nuvem, com o seu projeto e a <b>sua</b> assinatura. Nem nós vemos o que ele faz.
            </p>
            <div className="hero-actions">
              <Link className="bx bx-acc" to="/criar-conta">Começar grátis</Link>
              <a className="bx" href="#como">Como funciona</a>
            </div>
            <div className="hero-cmd"><InstallTabs /></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.15, ease }}>
            <ProductDemo />
          </motion.div>
        </div>
      </section>

      {/* números honestos, sem logos emprestados */}
      <div className="strip mono">
        <div className="wrap strip-in">
          <span>US$ {gift.toFixed(0)} GRÁTIS PARA TESTAR</span><i>·</i>
          <span>{usd(small?.usdHour)}/H POR MÁQUINA</span><i>·</i>
          <span>SOBE EM ~2–3 MIN</span><i>·</i>
          <span>ATÉ 24 GB POR SUBAGENTE</span><i>·</i>
          <span>AWS NITRO ENCLAVES</span>
        </div>
      </div>

      {/* 2 · Onde isso entra no meu dia a dia? */}
      <section id="como" className="sec">
        <div className="wrap">
          <Reveal><Tag>Onde o ramwisp entra</Tag>
            <h2 className="display-2">Seu agente continua no seu terminal.<br /><span className="dim-2">O peso vai para a nuvem.</span></h2>
            <p className="sec-p">Você não troca de ferramenta nem escreve integração. O ramwisp é um MCP: o Claude Code ou o Codex ganha a capacidade de subir subagentes em máquinas próprias e decide sozinho quando usar.</p>
          </Reveal>
        </div>
        <IsoSteps />
        <div className="wrap">
          <Reveal>
            <div className="spec-grid">
              {SPECS.map(([k, v]) => <div key={k} className="spec-row"><b>{k}</b><span className="mono">{v}</span></div>)}
            </div>
          </Reveal>
        </div>
      </section>

      {/* 3 · E a minha chave? */}
      <section id="privacidade" className="sec">
        <div className="wrap">
          <Reveal><Tag>Privacidade</Tag>
            <h2 className="display-2">Sua chave viaja trancada.<br /><span className="dim-2">Nem nós abrimos.</span></h2>
            <p className="sec-p">Antes de mandar qualquer coisa, o MCP confere no seu computador uma prova assinada pelo hardware da AWS de que a máquina roda exatamente o código publicado (PCR0). Só então cifra o seu login, o projeto e a tarefa para uma chave que existe apenas dentro dela.</p>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="flow3">
              <div className="flow-col">
                <Tag>Seu computador</Tag>
                <ul className="mono"><li>✓ confere a prova do hardware</li><li>✓ cifra login, projeto e tarefa</li><li>✓ abre a resposta e o patch</li></ul>
              </div>
              <div className="flow-arrow mono">→</div>
              <div className="flow-col">
                <Tag>Servidor ramwisp</Tag>
                <ul className="mono"><li className="scr">▓▒░▓▒ ilegível ▒░▓▒▓</li><li>vê horário, RAM, custo</li><li>vê os domínios acessados</li></ul>
              </div>
              <div className="flow-arrow mono">→</div>
              <div className="flow-col flow-acc">
                <Tag acc>Enclave lacrada</Tag>
                <ul className="mono"><li>✓ só aqui a chave abre</li><li>✓ roda o agente em memória</li><li>✓ evapora ao entregar</li></ul>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="spec-grid">
              <div className="spec-row"><b>Só o token de acesso</b><span className="mono">o de renovação nunca sai do seu computador</span></div>
              <div className="spec-row"><b>Mudou o código, recusa</b><span className="mono">PCR0 diferente → nada é enviado</span></div>
              <div className="spec-row"><b>Sem disco</b><span className="mono">a enclave só tem memória, destruída no fim</span></div>
              <div className="spec-row"><b>Auditável</b><span className="mono"><Link to="/transparencia">hashes e raiz de confiança →</Link></span></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 4 · Quanto custa e quem controla? */}
      <section id="precos" className="sec">
        <div className="wrap">
          <Reveal><Tag>Preço e controle</Tag>
            <h2 className="display-2">Paga a máquina por segundo.<br /><span className="dim-2">O modelo continua sendo seu.</span></h2>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="price-pro">
              <div className="pp-card">
                <span className="mono dim">ATÉ 8 GB DE RAM</span>
                <div className="pp-num">{usd(small?.usdHour)}<small>/h</small></div>
                <span className="mono dim">≈ {usd((small?.usdHour ?? 0.2) / 6)} por 10 min</span>
              </div>
              <div className="pp-card">
                <span className="mono dim">ATÉ 24 GB DE RAM</span>
                <div className="pp-num">{usd(big?.usdHour)}<small>/h</small></div>
                <span className="mono dim">testes pesados, builds nativos</span>
              </div>
              <div className="pp-card pp-acc">
                <span className="mono">PARA COMEÇAR</span>
                <div className="pp-num">US$ {gift.toFixed(0)}<small> grátis</small></div>
                <Link className="bx bx-acc" to="/criar-conta">Criar conta</Link>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="spec-grid">
              <div className="spec-row"><b>Cobrança</b><span className="mono">por segundo · mínimo de 60 s</span></div>
              <div className="spec-row"><b>Teto</b><span className="mono">nunca passa do saldo: reserva o máximo e devolve a sobra</span></div>
              <div className="spec-row"><b>Tempo máximo</b><span className="mono">30 min padrão · até 2 h · evapora sozinho</span></div>
              <div className="spec-row"><b>Painel ao vivo</b><span className="mono">RAM de cada subagente · encerrar a qualquer momento</span></div>
              <div className="spec-row"><b>Tokens</b><span className="mono">sua assinatura ou chave · 4 subagentes = 4 sessões</span></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 5 · Como começo? */}
      <section id="comecar" className="sec">
        <div className="wrap">
          <Reveal><Tag>Começar</Tag><h2 className="display-2">Um comando.<br /><span className="dim-2">Um clique no navegador.</span></h2></Reveal>
          <Reveal delay={0.05}>
            <div className="steps-pro">
              <div className="st"><span className="mono acc">01</span><b>Adicione o MCP no seu agente</b><InstallTabs /></div>
              <div className="st"><span className="mono acc">02</span><b>Aprove no navegador</b><p>Na primeira vez o MCP abre uma página. Crie a conta ou entre e clique em autorizar.</p></div>
              <div className="st"><span className="mono acc">03</span><b>Peça ao seu agente</b><p>“Roda os testes de cada pacote em subagentes ramwisp com 8 GB.” Funciona igual no Claude Code e no Codex, e cada subagente pode rodar com qualquer um dos dois.</p></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 6 · Objeções */}
      <section className="sec">
        <div className="wrap faq-pro">
          <Reveal><Tag>Perguntas</Tag><h2 className="display-2">Antes de testar.</h2></Reveal>
          <div>{FAQ.map(([q, a]) => <details key={q} className="fq"><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="sec final-pro">
        <BlockField intensity={1.2} />
        <div className="wrap final-in">
          <GhostMark size={56} />
          <h2 className="display-2">Deixe a RAM do seu notebook em paz.</h2>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link className="bx bx-acc" to="/criar-conta">Começar grátis</Link>
            <Link className="bx" to="/transparencia">Transparência</Link>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}

const FAQ: [string, string][] = [
  ['Por que um subagente gasta tanta RAM?', 'O modelo roda na API, mas o que o subagente faz roda na máquina: instalar dependências, compilar, rodar a suíte de testes, abrir um navegador. É isso que come gigas, e é isso que vai para a máquina dele.'],
  ['O que a máquina tem instalado?', 'Claude Code, Codex, git, Python 3, Node.js e npm, curl. Tem internet (HTTPS) e instala o que precisar com pip ou npm. Não tem Docker nem acesso à sua rede local.'],
  ['Meu código fica guardado em algum lugar?', 'Não. A cópia vai cifrada direto para dentro da enclave; o nosso servidor só guarda bytes ilegíveis até a máquina buscar. No fim, a máquina é destruída com a memória.'],
  ['O subagente pode dar commit ou push?', 'Não. Ele não recebe suas credenciais de git nem SSH. As mudanças voltam como patch e quem decide aplicar é você.'],
  ['Por que demora 2–3 minutos para começar?', 'É uma máquina nova, só sua, criada para a tarefa. Vale para trabalhos de minutos a horas, em paralelo.'],
  ['Posso usar o meu login do Claude ou do ChatGPT?', 'Para uso pessoal, sim: o MCP usa o login do seu computador (só o token de acesso). Para uso comercial ou em equipe, use uma chave de API no env do MCP.'],
  ['Qual a diferença para uma sandbox de agentes?', 'Sandboxes são infraestrutura para quem constrói agentes, via SDK. O ramwisp é para quem usa o Claude Code ou o Codex no dia a dia: sem código, com a sua própria assinatura, e com enclave atestada para que nem nós vejamos o que roda.'],
]
