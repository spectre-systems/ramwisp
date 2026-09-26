import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * "Como funciona" em 5 passos, preso na tela enquanto a pessoa rola.
 * Três planos de blocos em perspectiva: SEU NOTEBOOK → RAMWISP · ATESTAÇÃO → ENCLAVES.
 * O plano do passo atual sobe e acende; os blocos desenham o que acontece (em degraus, ~8 quadros/s).
 * O mouse acende os blocos por onde passa.
 */
const COLS = 16, ROWS = 10
const STEPS = [
  { n: '01', t: 'Pedir', d: 'Seu agente chama spawn_agent. O MCP empacota uma cópia do projeto (só o que o git rastreia) e pede uma máquina.', layer: 0 },
  { n: '02', t: 'Provar', d: 'A máquina nova mostra uma prova assinada pelo hardware da AWS com o hash do código que está rodando. O MCP confere no seu computador.', layer: 1 },
  { n: '03', t: 'Selar', d: 'Só se a prova bater: login, projeto e tarefa são cifrados para uma chave que existe apenas dentro daquela máquina.', layer: 1 },
  { n: '04', t: 'Rodar', d: 'Cada subagente trabalha na própria máquina, com a RAM que precisa. O seu notebook fica livre.', layer: 2 },
  { n: '05', t: 'Evaporar', d: 'A resposta e o patch voltam cifrados para você. A máquina é destruída junto com a memória.', layer: 2 },
]
const LAYERS = ['SEU NOTEBOOK', 'RAMWISP · ATESTAÇÃO', 'ENCLAVES · 4 × 8 GB']
const LOCK = ['..####..', '.#....#.', '.#....#.', '########', '###..###', '###..###', '########']

type Lv = 0 | 1 | 2 | 3   // apagado, fraco, aceso, acento

function cellLevel(layer: number, step: number, tick: number, c: number, r: number, seed: number): Lv {
  const active = STEPS[step].layer === layer
  if (layer === 0) {
    if (r === 8 && c >= 1 && c <= 5) return 3                         // barra de RAM do notebook: 31%
    if (r === 8 && c >= 1 && c <= 14) return 1
    if (step === 0) {                                                  // o projeto sendo empacotado
      const inBox = c >= 5 && c <= 10 && r >= 2 && r <= 6
      const order = (r - 2) * 6 + (c - 5)
      if (inBox) return order < tick % 44 ? 2 : 1
    }
    return seed > 0.93 ? 1 : 0
  }
  if (layer === 1) {
    if (step === 1) {                                                  // varredura da atestação
      const col = tick % (COLS + 4)
      if (c === col) return 3
      if (c === col - 1 || c === col - 2) return 2
      return seed > 0.8 ? 1 : 0
    }
    if (step === 2) {                                                  // cadeado se formando
      const lx = c - 4, ly = r - 1
      const on = ly >= 0 && ly < LOCK.length && lx >= 0 && lx < 8 && LOCK[ly][lx] === '#'
      if (on) return (lx + ly * 8) < tick % 70 ? 3 : 1
      return 0
    }
    return seed > (active ? 0.6 : 0.9) ? 1 : 0
  }
  // enclaves: 4 máquinas de 3 colunas
  const m = Math.floor(c / 4), inM = c % 4 !== 3 && r >= 1 && r <= 8
  if (!inM) return 0
  if (step === 3) {
    const h = 3 + Math.round(2.5 + 2.5 * Math.sin(tick * 0.35 + m * 1.7))   // RAM de cada máquina subindo e descendo
    return 8 - r < h ? 3 : 1
  }
  if (step === 4) return seed > Math.min(1, (tick % 40) / 26) ? 2 : 0      // evaporando bloco a bloco
  return step < 3 ? (r === 8 ? 1 : 0) : 1
}

function Layer({ i, step, tick, hover, setHover }: { i: number; step: number; tick: number; hover: [number, number] | null; setHover: (h: [number, number] | null) => void }) {
  const seeds = useMemo(() => Array.from({ length: COLS * ROWS }, () => Math.random()), [])
  const activeLayer = STEPS[step].layer
  const active = activeLayer === i
  const above = i < activeLayer          // planos acima do ativo sobem e ficam translúcidos (abre a "gaveta")
  return (
    <div className={`iso-layer l${i} ${active ? 'on' : ''}`}
      style={{ transform: `translateZ(${(2 - i) * 110 + (active ? 40 : 0) + (above ? 170 : 0)}px)`, opacity: above ? 0.22 : 1 }}
      onPointerLeave={() => setHover(null)}>
      <span className="iso-label mono">{LAYERS[i]}</span>
      <div className="iso-grid">
        {seeds.map((sd, k) => {
          const c = k % COLS, r = Math.floor(k / COLS)
          let lv = cellLevel(i, step, tick, c, r, sd)
          if (hover && hover[0] === i) {
            const d = Math.hypot(hover[1] % COLS - c, Math.floor(hover[1] / COLS) - r)
            if (d < 2.2) lv = Math.max(lv, d < 1 ? 3 : 2) as Lv
          }
          return <i key={k} className={`b${lv}`} onPointerEnter={() => setHover([i, k])} />
        })}
      </div>
    </div>
  )
}

export function IsoSteps() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [step, setStep] = useState(0)
  const [tick, setTick] = useState(0)
  const [hover, setHover] = useState<[number, number] | null>(null)
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(4, Math.max(0, Math.floor(v * 5)))))
  useEffect(() => { setTick(0) }, [step])
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 125); return () => clearInterval(t) }, [])

  return (
    <div ref={ref} className="iso-sec">
      <div className="iso-sticky">
        <div className="wrap iso-grid-wrap">
          <div className="iso-stage" aria-hidden>
            <div className="iso">
              {[0, 1, 2].map((i) => <Layer key={i} i={i} step={step} tick={tick} hover={hover} setHover={setHover} />)}
            </div>
          </div>
          <div className="iso-steps">
            <span className="tag mono">[ Como funciona, passo a passo ]</span>
            <ol>
              {STEPS.map((s, i) => (
                <li key={s.n} className={i === step ? 'on' : i < step ? 'past' : ''}
                  onClick={() => { const el = ref.current!; const top = el.offsetTop + (el.offsetHeight - window.innerHeight) * ((i + 0.5) / 5); window.scrollTo({ top, behavior: 'smooth' }) }}>
                  <span className="mono n">{s.n}</span>
                  <div>
                    <b>{s.t}</b>
                    <AnimatePresence initial={false}>
                      {i === step && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{s.d}</motion.p>}
                    </AnimatePresence>
                  </div>
                </li>
              ))}
            </ol>
            <div className="iso-progress"><motion.i style={{ scaleX: scrollYProgress }} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}
