import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * "Como funciona" em 5 passos, preso na tela enquanto a pessoa rola.
 * Um tabuleiro de blocos em perspectiva com 3 áreas: SEU NOTEBOOK → PORTÃO DE ATESTAÇÃO → 4 MÁQUINAS.
 * Os subagentes são fantasminhas de blocos (5×5) que andam célula a célula entre as áreas.
 * Tudo em degraus (8 quadros/s). O mouse acende os blocos por onde passa.
 */
const COLS = 40, ROWS = 18
const STEPS = [
  { n: '01', t: 'Pedir', d: 'Seu agente chama spawn_agent. Os 4 subagentes estão espremidos no seu notebook e a RAM dele está no vermelho. O MCP empacota uma cópia do projeto e pede uma máquina para cada um.' },
  { n: '02', t: 'Provar', d: 'Cada máquina nova mostra uma prova assinada pelo hardware da AWS com o hash do código que está rodando. O MCP confere no seu computador.' },
  { n: '03', t: 'Selar', d: 'A prova bateu: cada subagente sai cifrado para uma chave que só existe dentro da sua máquina e atravessa o portão.' },
  { n: '04', t: 'Rodar', d: 'Cada subagente trabalha na própria máquina, com a RAM que precisa. O seu notebook volta para o verde.' },
  { n: '05', t: 'Evaporar', d: 'A resposta e o patch voltam cifrados para o notebook. As máquinas são destruídas junto com a memória.' },
]

// fantasminha 5×5: '#' corpo, '.' vazio (olhos e recortes da barra); 2 quadros de barra
const GHOST = [['.###.', '#####', '#.#.#', '#####', '#.#.#'], ['.###.', '#####', '#.#.#', '#####', '.#.#.']]
const CHECK = ['.....#', '....#.', '#..#..', '.##...']
const LOCK = ['.##.', '#..#', '####', '####']
const NOTE = { c: 1, r: 2, w: 12, h: 13 }            // área do notebook
const GATE = { c: 17, r: 1, w: 2, h: 16 }             // portão de atestação
const VMS = [[24, 1], [32, 1], [24, 9], [32, 9]]      // 4 máquinas 7×7
const CRAM = [[1, 2], [6, 2], [2, 6], [7, 6]]         // espremidos no notebook (sobrepostos)
const LANE = [[14, 2], [14, 5], [14, 9], [14, 12]]    // fila antes do portão

type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6
// 0 apagado · 1 área · 2 branco · 3 ciano · 4 vermelho · 5 verde · 6 dourado

function target(step: number, i: number, tick: number): [number, number] {
  if (step === 0) return CRAM[i] as [number, number]
  if (step === 1) return LANE[i] as [number, number]
  if (step === 2) return tick > 6 + i * 5 ? [VMS[i][0] + 1, VMS[i][1] + 1] : (LANE[i] as [number, number])
  return [VMS[i][0] + 1, VMS[i][1] + 1]
}

function useBoard(step: number, tick: number) {
  const pos = useRef<[number, number][]>(CRAM.map((p) => [...p] as [number, number]))
  const seeds = useMemo(() => Array.from({ length: COLS * ROWS }, () => Math.random()), [])
  const last = useRef('')
  // anda uma célula por quadro na direção do alvo (primeiro na horizontal); só avança quando o quadro muda
  if (last.current !== `${step}:${tick}`) {
    last.current = `${step}:${tick}`
    pos.current = pos.current.map(([c, r], i) => {
      const [tc, tr] = target(step, i, tick)
      if (c !== tc) return [c + Math.sign(tc - c), r]
      if (r !== tr) return [c, r + Math.sign(tr - r)]
      return [c, r]
    })
  }
  const g: Cell[] = new Array(COLS * ROWS).fill(0)
  const set = (c: number, r: number, v: Cell) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) g[r * COLS + c] = v }

  // áreas
  for (let r = NOTE.r; r < NOTE.r + NOTE.h; r++) for (let c = NOTE.c; c < NOTE.c + NOTE.w; c++) if (seeds[r * COLS + c] > 0.86) set(c, r, 1)
  const hot = step === 0
  const ramCells = hot ? NOTE.w : step >= 3 ? 4 : 9
  for (let c = 0; c < NOTE.w; c++) set(NOTE.c + c, NOTE.r + NOTE.h, c < ramCells ? (hot ? 4 : 5) : 1)   // barra de RAM do notebook
  for (let r = GATE.r; r < GATE.r + GATE.h; r++) for (let c = GATE.c; c < GATE.c + GATE.w; c++) {
    const scan = step === 2 && (r + tick) % 6 < 2
    set(c, r, scan ? 3 : 1)
  }
  if (step === 2 && tick % 4 < 2) LOCK.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') set(GATE.c - 1 + x, 7 + y, 3) }))
  const vmOn = step >= 1 && !(step === 4 && tick > 18)
  VMS.forEach(([c0, r0], m) => {
    if (!vmOn) return
    for (let r = r0; r < r0 + 7; r++) for (let c = c0; c < c0 + 7; c++) {
      const edge = r === r0 || r === r0 + 6 || c === c0 || c === c0 + 6
      if (step === 4 && seeds[r * COLS + c] < (tick - 8) / 10) continue          // evaporando bloco a bloco
      if (edge) set(c, r, step === 1 && (c - c0 + tick) % 7 === 0 ? 3 : 1)
    }
    if (step === 1 && tick > 8 + m * 3) CHECK.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') set(c0 + 1 + x - 0, r0 + 2 + y - 1, 5) }))
    if (step === 3) {                                                            // RAM de cada máquina subindo e descendo
      const h = 2 + Math.round(2 + 2 * Math.sin(tick * 0.5 + m * 1.9))
      for (let k = 0; k < 5; k++) set(c0 + 1 + k, r0 + 7, k < h ? 3 : 1)
    }
  })
  // pacotes de resposta voltando
  if (step === 4) VMS.forEach(([c0, r0], m) => {
    const k = tick - m * 2
    if (k < 0 || k > 22) return
    const c = Math.max(NOTE.c + NOTE.w - 1, c0 - k), r = r0 + 3
    set(c, r, 6)
    if (k > 20 || c === NOTE.c + NOTE.w - 1) set(NOTE.c + 2 + m * 2, NOTE.r + 1, 6)
  })
  // fantasminhas
  const ghostsOn = !(step === 4 && tick > 12)
  pos.current.forEach(([c0, r0], i) => {
    if (!ghostsOn) return
    const frame = GHOST[(tick + i) % 2]
    const color: Cell = step >= 2 && c0 > GATE.c ? 3 : step === 2 ? 3 : 2
    frame.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '#') return
      if (step === 4 && seeds[(r0 + y) * COLS + c0 + x] < (tick - 4) / 8) return
      set(c0 + x, r0 + y, color)
    }))
  })
  return g
}

function Board({ step, tick }: { step: number; tick: number }) {
  const g = useBoard(step, tick)
  const [hover, setHover] = useState<number | null>(null)
  const labels = [
    { t: 'SEU NOTEBOOK', c: NOTE.c, r: NOTE.r - 1.4, on: step === 0 || step === 4 },
    { t: 'ATESTAÇÃO', c: GATE.c - 2, r: GATE.r - 1.4 + 0, on: step === 1 || step === 2 },
    { t: 'MÁQUINAS · 4 × 8 GB', c: 24, r: -0.4, on: step >= 1 && step <= 3 },
  ]
  return (
    <div className="board" onPointerLeave={() => setHover(null)}>
      {labels.map((l) => (
        <span key={l.t} className={`board-label mono ${l.on ? 'on' : ''}`} style={{ left: `${(l.c / COLS) * 100}%`, top: `${(l.r / ROWS) * 100}%` }}>{l.t}</span>
      ))}
      <div className="board-grid">
        {g.map((v, k) => {
          let lv: number = v
          if (hover !== null && v === 0) {
            const d = Math.hypot((hover % COLS) - (k % COLS), Math.floor(hover / COLS) - Math.floor(k / COLS))
            if (d < 2.5) lv = d < 1 ? 3 : 1
          }
          return <i key={k} className={`c${lv}`} onPointerEnter={() => setHover(k)} />
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
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(4, Math.max(0, Math.floor(v * 5)))))
  useEffect(() => { setTick(0) }, [step])
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 125); return () => clearInterval(t) }, [])

  return (
    <div ref={ref} className="iso-sec">
      <div className="iso-sticky">
        <div className="wrap iso-grid-wrap">
          <div className="iso-stage" aria-label="Animação: subagentes saem do notebook, passam pelo portão de atestação, trabalham em máquinas próprias e voltam com a resposta">
            <div className="iso"><Board step={step} tick={tick} /></div>
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
