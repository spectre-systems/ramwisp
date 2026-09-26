import { AnimatePresence, motion, useInView } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Ghost } from './Ghost'
import { RamBar } from './ui'
import { PixelIcon } from './PixelIcon'

/** Roda um ciclo de passos só enquanto o bloco está na tela. */
function useSteps(n: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-80px' })
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!inView) return
    const t = setTimeout(() => setStep((s) => (s + 1) % n), step === n - 1 ? ms * 2.2 : ms)
    return () => clearTimeout(t)
  }, [inView, step, n, ms])
  return { ref, step }
}

// ---------------------------------------------------------------- 2. o dia a dia, no terminal

const TERM = [
  { who: 'you', text: 'roda os testes de cada pacote em paralelo no wisp e corrige o que quebrar' },
  { who: 'tool', text: 'spawn_agent × 4   workspace: "."   ram_gb: 8' },
  { who: 'info', text: 'projeto empacotado (1.284 arquivos, 3,1 MB) · cifrado para cada máquina' },
  { who: 'ghosts' },
  { who: 'tool', text: 'wait_agent × 4' },
  { who: 'result', text: 'api       ✓ 2 testes corrigidos   patch: 3 arquivos' },
  { who: 'result', text: 'web       ✓ tudo passando         patch: vazio' },
  { who: 'result', text: 'worker    ✓ 1 teste corrigido     patch: 1 arquivo' },
  { who: 'result', text: 'shared    ✓ tudo passando         patch: vazio' },
  { who: 'claude', text: 'Revisei e apliquei os 2 patches (git apply). A suíte inteira passa. As 4 máquinas já evaporaram.' },
] as const

export function TerminalDemo() {
  const { ref, step } = useSteps(TERM.length + 1, 900)
  return (
    <div ref={ref} className="term card">
      <div className="term-bar"><i /><i /><i /><span className="mono faint">claude — ~/projeto</span></div>
      <div className="term-body mono">
        {TERM.slice(0, step).map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`tl tl-${l.who}`}>
            {l.who === 'you' && <><span className="p">›</span> {l.text}</>}
            {l.who === 'tool' && <><span className="dot">●</span> {l.text}</>}
            {l.who === 'info' && <span className="faint">  ⎿ {l.text}</span>}
            {l.who === 'result' && <span>  ⎿ {l.text}</span>}
            {l.who === 'claude' && <><span className="dot ok">●</span> {l.text}</>}
            {l.who === 'ghosts' && (
              <span className="tl-ghosts">  ⎿ {[0, 1, 2, 3].map((g) => <Ghost key={g} mood={step > 4 ? 'happy' : 'work'} size={22} hue={(g % 3) as 0 | 1 | 2} />)}
                <span className="faint"> 4 máquinas de 8 GB · lacradas ✓</span></span>
            )}
          </motion.div>
        ))}
        {step <= TERM.length && <span className="cursor" />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 3. a chave trancada

const SCRAMBLE = '▒░▓█▚▞▙▟'
function Scrambled({ len = 18 }: { len?: number }) {
  const [s, setS] = useState('')
  useEffect(() => {
    const t = setInterval(() => setS(Array.from({ length: len }, () => SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]).join('')), 120)
    return () => clearInterval(t)
  }, [len])
  return <span className="mono scr">{s}</span>
}

export function KeyVault() {
  const { ref, step } = useSteps(4, 1500)
  const sealed = step >= 1
  return (
    <div ref={ref} className="vault card glow">
      <div className="vault-row">
        <div className="vault-side">
          <span className="faint mono small">seu computador</span>
          <div className="vault-items">
            <span className="chip-k"><PixelIcon name="key" accent="#f6c85f" /> login ou chave</span>
            <span className="chip-k"><PixelIcon name="folder" accent="#9ff0ff" /> seu projeto</span>
            <span className="chip-k"><PixelIcon name="note" accent="#cdbdff" /> a tarefa</span>
          </div>
          <motion.div className="check-seal" animate={{ opacity: step >= 1 ? 1 : 0.25 }}>
            {step >= 1 ? '✓' : '…'} o MCP confere o lacre da máquina antes de mandar
          </motion.div>
        </div>

        <div className="vault-path">
          <motion.div className="envelope" animate={{ x: step >= 2 ? '100%' : '0%', opacity: sealed ? 1 : 0.3 }} transition={{ duration: 1.1, ease: 'easeInOut' }}>
            <PixelIcon name="lock" size={32} color="#0a3a44" accent="var(--wisp)" />
          </motion.div>
          <div className="path-line" />
          <div className="observers">
            {['servidor ramwisp', 'AWS', 'alguém espiando'].map((o) => (
              <div key={o} className="observer">
                <span className="eye"><PixelIcon name="eye" size={16} color="var(--muted)" accent="var(--err)" /></span>
                <span className="small faint">{o} vê:</span>
                {step >= 2 ? <Scrambled len={o.length > 10 ? 14 : 10} /> : <span className="mono faint">—</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="vault-side enclave-side">
          <span className="faint mono small">máquina lacrada (enclave)</span>
          <div className="enclave-box">
            <Ghost mood={step >= 3 ? 'work' : 'sleep'} size={46} />
            <AnimatePresence>{step >= 3 && <motion.span className="small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>só aqui dentro a chave abre</motion.span>}</AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 4. evapora

export function Evaporate() {
  const { ref, step } = useSteps(5, 1100)
  const items = ['resposta e patch entregues para você', 'chave apagada da memória', 'máquina destruída', 'nada gravado em disco (a enclave nem tem disco)']
  return (
    <div ref={ref} className="evap card">
      <div className="evap-stage">
        <motion.div className="evap-box" animate={{ opacity: step >= 2 ? 0 : 1, filter: step >= 2 ? 'blur(10px)' : 'blur(0px)', y: step >= 2 ? -20 : 0 }} transition={{ duration: 1.2 }}>
          <span className="mono faint small">máquina 3 · 8 GB</span>
          <Ghost mood={step >= 1 ? 'happy' : 'work'} size={56} />
          <RamBar used={step >= 1 ? 10 : 62} total={100} />
        </motion.div>
        {step >= 2 && Array.from({ length: 14 }).map((_, i) => (
          <motion.span key={i} className="particle" initial={{ opacity: 0.9, x: 0, y: 0 }}
            animate={{ opacity: 0, x: (i % 2 ? 1 : -1) * (10 + i * 5), y: -60 - (i % 5) * 16 }} transition={{ duration: 1.6, delay: i * 0.04 }} />
        ))}
        <AnimatePresence>
          {step >= 1 && (
            <motion.div className="evap-result" initial={{ opacity: 0, x: 0 }} animate={{ opacity: 1, x: 8 }} exit={{ opacity: 0 }}>
              ✓ resposta + patch → você
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ul className="evap-list">
        {items.map((t, i) => (
          <motion.li key={t} animate={{ opacity: step >= 1 + Math.min(i, 3) ? 1 : 0.25 }}>
            <span className={`check ${step >= 1 + Math.min(i, 3) ? 'done' : ''}`}>{step >= 1 + Math.min(i, 3) ? '✓' : ''}</span>{t}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- 5. você no controle (recorte do painel real)

export function ControlPreview() {
  const [used, setUsed] = useState([3.1, 5.4, 1.2])
  const [killed, setKilled] = useState<number | null>(null)
  useEffect(() => {
    const t = setInterval(() => setUsed((u) => u.map((x, i) => Math.max(0.6, Math.min(7.6, x + (Math.random() - 0.45) * (i + 1) * 0.6)))), 1400)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="ctl card">
      <div className="ctl-head"><strong>Ao vivo</strong><span className="pill live"><span className="dot" />{killed === null ? 3 : 2}</span><span className="faint small" style={{ marginLeft: 'auto' }}>saldo US$ 2,84</span></div>
      <div className="ctl-grid">
        {[0, 1, 2].map((i) => (
          <AnimatePresence key={i}>
            {killed !== i && (
              <motion.div className="ctl-agent" exit={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }} layout>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Ghost mood="work" size={30} hue={i as 0 | 1 | 2} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono small">{['wp-3fa91c', 'wp-8b20de', 'wp-c4417a'][i]}</div>
                    <div className="faint small">{['testes api', 'refatorar web', 'pesquisa libs'][i]} · {[4, 11, 2][i]} min</div>
                  </div>
                </div>
                <div className="mono small" style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0 6px' }}><span className="faint">RAM</span><span>{used[i].toFixed(1)} / 8 GB</span></div>
                <RamBar used={used[i]} total={8} />
                <button className="btn sm danger" style={{ marginTop: 10, width: '100%' }} onClick={() => setKilled(i)}>Encerrar agora</button>
              </motion.div>
            )}
          </AnimatePresence>
        ))}
      </div>
      {killed !== null && <motion.p className="small faint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ margin: '10px 0 0' }}>Encerrado: a máquina foi destruída na hora e você pagou só os minutos usados. <a href="#" onClick={(e) => { e.preventDefault(); setKilled(null) }} style={{ color: 'var(--wisp)' }}>desfazer demo</a></motion.p>}
    </div>
  )
}
