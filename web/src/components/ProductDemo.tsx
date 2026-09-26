import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { GhostMark } from './Mark'

/**
 * Demonstração do produto na primeira tela (sem ilustração): uma sessão real do Claude Code usando o ramwisp
 * à esquerda e, à direita, o que acontece de fato — o notebook fica leve e 4 máquinas atestadas trabalham.
 * As abas trocam o cenário (o que mais pesa na RAM de um subagente).
 */
type Line = { k: 'you' | 'tool' | 'sub' | 'ok' | 'done'; t: string }
const SCENARIOS: { tab: string; ask: string; jobs: string[]; results: string[]; done: string }[] = [
  { tab: 'Testes', ask: 'roda os testes de cada pacote em paralelo e corrige o que quebrar',
    jobs: ['api', 'web', 'worker', 'shared'],
    results: ['api     ✓ 2 corrigidos · patch', 'web     ✓ 214 passando', 'worker  ✓ 1 corrigido · patch', 'shared  ✓ 88 passando'],
    done: 'Apliquei os 2 patches. A suíte inteira passa.' },
  { tab: 'Build', ask: 'compila o app web, o mobile e a API e me diz o que falhou',
    jobs: ['web', 'ios', 'android', 'api'],
    results: ['web     ✓ build ok · 48s', 'ios     ✗ falta um pod · patch', 'android ✓ build ok · 2m10s', 'api     ✓ build ok · 31s'],
    done: 'Só o iOS falhou: faltava uma dependência. Patch pronto para revisar.' },
  { tab: 'Navegador', ask: 'testa os 4 fluxos de checkout num navegador headless',
    jobs: ['pix', 'cartão', 'boleto', 'cupom'],
    results: ['pix     ✓ pago em 3,1s', 'cartão  ✓ pago em 4,0s', 'boleto  ✗ botão sumiu · patch', 'cupom   ✓ desconto ok'],
    done: 'O boleto quebra no mobile. Corrigi o CSS; o patch está pronto.' },
  { tab: 'Pesquisa', ask: 'compara 4 bibliotecas de fila e roda um benchmark de cada',
    jobs: ['bullmq', 'pg-boss', 'bee', 'agenda'],
    results: ['bullmq  ✓ 41k jobs/s', 'pg-boss ✓ 9k jobs/s', 'bee     ✓ 33k jobs/s', 'agenda  ✓ 3k jobs/s'],
    done: 'BullMQ ganhou com folga. Relatório com os números completos.' },
]

function uptime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60)
  return [h, m, x].map((v) => String(v).padStart(2, '0')).join(':')
}

export function ProductDemo() {
  const [tab, setTab] = useState(0)
  const [auto, setAuto] = useState(true)
  const [step, setStep] = useState(0)
  const [secs, setSecs] = useState(1337)
  const sc = SCENARIOS[tab]
  const lines: Line[] = [
    { k: 'you', t: sc.ask },
    { k: 'tool', t: 'spawn_agent × 4 · 8 GB cada' },
    { k: 'sub', t: 'atestadas ✓ · projeto cifrado' },
    { k: 'tool', t: 'wait_agent × 4' },
    ...sc.results.map((t) => ({ k: 'ok' as const, t })),
    { k: 'done', t: sc.done },
  ]
  const TOTAL = lines.length

  useEffect(() => { setStep(0) }, [tab])
  useEffect(() => {
    const t = setTimeout(() => {
      if (step < TOTAL) setStep(step + 1)
      else if (auto) setTab((x) => (x + 1) % SCENARIOS.length)
    }, step === 0 ? 500 : step < TOTAL ? 650 : 3800)
    return () => clearTimeout(t)
  }, [step, TOTAL, auto])
  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [])

  const phase = step < 2 ? 'idle' : step < 4 ? 'boot' : step < TOTAL - 1 ? 'run' : 'done'
  const status = (i: number) => phase === 'idle' ? '—' : phase === 'boot' ? 'atestando' : phase === 'run' ? (step - 4 > i ? 'pronto' : 'rodando') : 'evaporou'

  return (
    <div className="demo">
      <div className="demo-bar">
        <span className="demo-menu"><i /><i /><i /></span>
        <span className="mono">claude <span className="dim">·</span> ~/projeto <span className="dim">@ ramwisp</span></span>
        <span className="demo-chip mono">us-east-1</span>
      </div>
      <div className="demo-body">
        <div className="demo-term mono">
          <AnimatePresence mode="popLayout">
            {lines.slice(0, step).map((l, i) => (
              <motion.div key={`${tab}-${i}`} className={`dl dl-${l.k}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                {l.k === 'you' && <><span className="acc">›</span> {l.t}</>}
                {l.k === 'tool' && <><span className="acc">●</span> {l.t}</>}
                {l.k === 'sub' && <span className="dim">  ⎿ {l.t}</span>}
                {l.k === 'ok' && <span className={l.t.includes('✗') ? 'warn' : 'okc'}>  ⎿ {l.t}</span>}
                {l.k === 'done' && <><span className="okc">●</span> <span className="plain">{l.t}</span></>}
              </motion.div>
            ))}
          </AnimatePresence>
          {step < TOTAL && <span className="caret" />}
        </div>
        <div className="demo-side">
          <div className="side-block">
            <div className="side-h mono"><span>SEU NOTEBOOK · 16 GB</span><span className="okc">{phase === 'idle' ? '34%' : '31%'}</span></div>
            <div className="meter"><motion.i animate={{ width: phase === 'idle' ? '34%' : '31%' }} /></div>
            <div className="side-note mono dim">{phase === 'idle' ? 'livre para você' : '4 subagentes rodando fora daqui'}</div>
          </div>
          <div className="side-block">
            <div className="side-h mono"><span>MÁQUINAS</span><span className="dim">nitro enclave</span></div>
            {sc.jobs.map((j, i) => {
              const st = status(i)
              const ram = phase === 'run' ? [62, 48, 71, 39][i] : phase === 'boot' ? 8 : 0
              return (
                <div key={j} className={`vm-row ${st}`}>
                  <GhostMark size={16} />
                  <span className="mono vm-name">{j}</span>
                  <span className="meter sm"><motion.i animate={{ width: `${ram}%` }} transition={{ duration: 0.8 }} /></span>
                  <span className="mono vm-st">{st}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="demo-foot mono">
        <span>ENCLAVE ATESTADA <span className="dim">· PCR0 32d2…d0a4e</span></span>
        <span><span className="live-dot" /> UPTIME {uptime(secs)}</span>
      </div>
      <div className="demo-tabs" role="tablist">
        {SCENARIOS.map((s, i) => (
          <button key={s.tab} role="tab" aria-selected={i === tab} className={i === tab ? 'on' : ''} onClick={() => { setTab(i); setAuto(false) }}>{s.tab}</button>
        ))}
      </div>
    </div>
  )
}
