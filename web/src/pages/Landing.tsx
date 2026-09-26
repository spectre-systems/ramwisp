import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, codexToml, installCmd, type PublicInfo } from '../api'
import { Footer, Nav } from '../components/Chrome'
import { GhostMark } from '../components/Mark'
import { ProductDemo } from '../components/ProductDemo'
import { BlockField } from '../components/BlockField'
import { IsoSteps } from '../components/IsoSteps'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { CopyCommand, Reveal } from '../components/ui'
import '../landing.css'

const ease = [0.16, 1, 0.3, 1] as const

/** Install for Claude Code OR Codex: the visitor picks the agent they already use. */
function InstallTabs() {
  const [tab, setTab] = useState<'claude' | 'codex'>('claude')
  return (
    <div className="itabs">
      <div className="itabs-bar mono" role="tablist">
        {(['claude', 'codex'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'claude' ? 'Claude Code' : 'Codex'}</button>
        ))}
        <span className="dim">{tab === 'claude' ? 'in your terminal' : 'in ~/.codex/config.toml'}</span>
      </div>
      {tab === 'claude'
        ? <CopyCommand cmd={installCmd()} />
        : <CopyCommand cmd={codexToml()} prompt="" />}
    </div>
  )
}
const Tag = ({ children, acc }: { children: string; acc?: boolean }) => <span className={`tag mono ${acc ? 'acc' : ''}`}>[ {children} ]</span>

const SPECS: [string, string][] = [
  ['Where it runs', 'one machine per subagent · AWS Nitro Enclave'],
  ['How it gets there', 'MCP in Claude Code or Codex · spawn_agent()'],
  ['Your project', 'encrypted copy · git ls-files, never .gitignore'],
  ['The model', 'your own subscription or API key'],
  ['What comes back', 'answer + a patch for git apply'],
  ['The end', 'machine destroyed on delivery or at timeout'],
]

export default function Landing() {
  const [info, setInfo] = useState<PublicInfo | null>(null)
  useEffect(() => { api<PublicInfo>('GET', '/api/public/info').then(setInfo).catch(() => {}) }, [])
  const gift = (info?.signup_credit_cents ?? 300) / 100
  const small = info?.instance_types[0]
  const big = info?.instance_types[1]
  const usd = (v?: number) => (v ? `$${v.toFixed(2)}` : '—')

  return (
    <div className="pro">
      <Nav />

      {/* 1 · O que é isso? É comigo? */}
      <section className="hero-pro">
        <ErrorBoundary label="blocks"><BlockField /></ErrorBoundary>
        <div className="wrap hero-pro-grid">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}>
            <Tag>RAM for subagents</Tag>
            <h1 className="display">Your subagents<br />don’t fit in<br /><span className="acc">your RAM.</span></h1>
            <p className="hero-p">
              ramwisp takes the heavy lifting off your laptop. One command in Claude Code or Codex and every subagent runs on its
              own sealed machine in the cloud, with your project and <b>your</b> subscription. Not even we can see what it does.
            </p>
            <div className="hero-actions">
              <Link className="bx bx-acc" to="/criar-conta">Start free</Link>
              <a className="bx" href="#como">How it works</a>
            </div>
            <div className="hero-cmd"><InstallTabs /></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.15, ease }}>
            <ErrorBoundary label="demo"><ProductDemo /></ErrorBoundary>
          </motion.div>
        </div>
      </section>

      {/* números honestos, sem logos emprestados */}
      <div className="strip mono">
        <div className="wrap strip-in">
          <span>${gift.toFixed(0)} FREE TO TRY</span><i>·</i>
          <span>{usd(small?.usdHour)}/HR PER MACHINE</span><i>·</i>
          <span>READY IN ~1–3 MIN</span><i>·</i>
          <span>UP TO 24 GB PER SUBAGENT</span><i>·</i>
          <span>AWS NITRO ENCLAVES</span>
        </div>
      </div>

      {/* 2 · Onde isso entra no meu dia a dia? */}
      <section id="como" className="sec">
        <div className="wrap">
          <Reveal><Tag>Where ramwisp fits</Tag>
            <h2 className="display-2">Your agent stays in your terminal.<br /><span className="dim-2">The weight goes to the cloud.</span></h2>
            <p className="sec-p">No new tool to learn, no integration to write. ramwisp is an MCP server: Claude Code or Codex gains the ability to launch subagents on their own machines, and decides by itself when to use it.</p>
          </Reveal>
        </div>
        <ErrorBoundary label="steps"><IsoSteps /></ErrorBoundary>
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
          <Reveal><Tag>Privacy</Tag>
            <h2 className="display-2">Your key travels locked.<br /><span className="dim-2">Not even we can open it.</span></h2>
            <p className="sec-p">Before sending anything, the MCP checks — on your computer — a proof signed by AWS hardware that the machine runs exactly the published code (PCR0). Only then does it encrypt your login, your project and the task to a key that exists only inside that machine.</p>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="flow3">
              <div className="flow-col">
                <Tag>Your computer</Tag>
                <ul className="mono"><li>✓ verifies the hardware proof</li><li>✓ encrypts login, project and task</li><li>✓ opens the answer and the patch</li></ul>
              </div>
              <div className="flow-arrow mono">→</div>
              <div className="flow-col">
                <Tag>ramwisp server</Tag>
                <ul className="mono"><li className="scr">▓▒░▓▒ unreadable ▒░▓▒▓</li><li>sees time, RAM, cost</li><li>sees which domains were reached</li></ul>
              </div>
              <div className="flow-arrow mono">→</div>
              <div className="flow-col flow-acc">
                <Tag acc>Sealed enclave</Tag>
                <ul className="mono"><li>✓ the only place the key opens</li><li>✓ runs the agent in memory</li><li>✓ evaporates on delivery</li></ul>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="spec-grid">
              <div className="spec-row"><b>Access token only</b><span className="mono">the refresh token never leaves your computer</span></div>
              <div className="spec-row"><b>Code changed? Refused.</b><span className="mono">different PCR0 → nothing is sent</span></div>
              <div className="spec-row"><b>No disk</b><span className="mono">the enclave only has memory, wiped at the end</span></div>
              <div className="spec-row"><b>Auditable</b><span className="mono"><Link to="/transparencia">hashes and root of trust →</Link></span></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 4 · Quanto custa e quem controla? */}
      <section id="precos" className="sec">
        <div className="wrap">
          <Reveal><Tag>Pricing and control</Tag>
            <h2 className="display-2">Pay for the machine by the second.<br /><span className="dim-2">The model stays yours.</span></h2>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="price-pro">
              <div className="pp-card">
                <span className="mono dim">UP TO 8 GB OF RAM</span>
                <div className="pp-num">{usd(small?.usdHour)}<small>/h</small></div>
                <span className="mono dim">≈ {usd((small?.usdHour ?? 0.2) / 6)} per 10 min</span>
              </div>
              <div className="pp-card">
                <span className="mono dim">UP TO 24 GB OF RAM</span>
                <div className="pp-num">{usd(big?.usdHour)}<small>/h</small></div>
                <span className="mono dim">heavy test suites, native builds</span>
              </div>
              <div className="pp-card pp-acc">
                <span className="mono">TO GET STARTED</span>
                <div className="pp-num">${gift.toFixed(0)}<small> free</small></div>
                <Link className="bx bx-acc" to="/criar-conta">Create account</Link>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="spec-grid">
              <div className="spec-row"><b>Billing</b><span className="mono">per second · 60 s minimum</span></div>
              <div className="spec-row"><b>Hard cap</b><span className="mono">never exceeds your balance: reserves the max, refunds the rest</span></div>
              <div className="spec-row"><b>Time limit</b><span className="mono">30 min default · up to 2 h · evaporates on its own</span></div>
              <div className="spec-row"><b>Live dashboard</b><span className="mono">RAM of every subagent · kill any time</span></div>
              <div className="spec-row"><b>Tokens</b><span className="mono">your subscription or key · 4 subagents = 4 sessions</span></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 5 · Como começo? */}
      <section id="comecar" className="sec">
        <div className="wrap">
          <Reveal><Tag>Get started</Tag><h2 className="display-2">One command.<br /><span className="dim-2">One click in the browser.</span></h2></Reveal>
          <Reveal delay={0.05}>
            <div className="steps-pro">
              <div className="st"><span className="mono acc">01</span><b>Add the MCP to your agent</b><InstallTabs /></div>
              <div className="st"><span className="mono acc">02</span><b>Approve in the browser</b><p>The first time, the MCP opens a page. Create an account or sign in, then click authorize.</p></div>
              <div className="st"><span className="mono acc">03</span><b>Ask your agent</b><p>“Run each package’s tests in ramwisp subagents with 8 GB.” Works the same in Claude Code and Codex, and every subagent can run on either one.</p></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 6 · Objeções */}
      <section className="sec">
        <div className="wrap faq-pro">
          <Reveal><Tag>FAQ</Tag><h2 className="display-2">Before you try it.</h2></Reveal>
          <div>{FAQ.map(([q, a]) => <details key={q} className="fq"><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="sec final-pro">
        <BlockField intensity={1.2} />
        <div className="wrap final-in">
          <GhostMark size={56} />
          <h2 className="display-2">Give your laptop’s RAM a break.</h2>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link className="bx bx-acc" to="/criar-conta">Start free</Link>
            <Link className="bx" to="/transparencia">Transparency</Link>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}

const FAQ: [string, string][] = [
  ['Why does a subagent use so much RAM?', 'The model runs in the API, but what the subagent does runs on the machine: installing dependencies, compiling, running the test suite, opening a browser. That is what eats gigabytes — and that is what moves to its own machine.'],
  ['What is installed on the machine?', 'Claude Code, Codex, git, Python 3, Node.js and npm, curl. It has internet (HTTPS) and installs whatever it needs with pip or npm. No Docker and no access to your local network.'],
  ['Is my code stored anywhere?', 'No. The copy goes encrypted straight into the enclave; our server only holds unreadable bytes until the machine picks them up. At the end, the machine is destroyed along with its memory.'],
  ['Can the subagent commit or push?', 'No. It never gets your git or SSH credentials. Changes come back as a patch and you decide whether to apply it.'],
  ['Why does it take a minute or two to start?', 'It is a brand-new machine, just for you, created for the task. It shines on jobs that take minutes to hours, in parallel.'],
  ['Can I use my Claude or ChatGPT login?', 'For personal use, yes: the MCP uses the login already on your computer (access token only). For commercial or team use, put an API key in the MCP env instead.'],
  ['How is this different from an agent sandbox?', 'Sandboxes are infrastructure for people building agents, via an SDK. ramwisp is for people who use Claude Code or Codex every day: no code, your own subscription, and an attested enclave so not even we can see what runs.'],
]
