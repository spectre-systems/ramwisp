import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GooFilter } from './LiquidGhost'

/**
 * O brinquedo da primeira tela, que explica o produto por interação:
 *  fill  — cada clique solta um subagente líquido no pote "SUA RAM". Com o goo, eles se fundem num bolo
 *          e o nível sobe até transbordar (o problema, sentido na pele);
 *  split — "uma máquina para cada": o líquido estica e se separa em 4 bolhas de 8 GB (a solução);
 *  done  — cada bolha pinga a resposta de volta no pote e estoura (evapora).
 * Se ninguém mexer, roda sozinho.
 */
type Phase = 'fill' | 'split' | 'done'
const JAR = { x: 196, y: 250, w: 248, h: 228 }
const SLOTS = [[104, 96], [248, 96], [392, 96], [536, 96]]
const PACK = [[286, 418], [354, 418], [320, 358], [320, 300]]   // apertados: o goo funde uns nos outros
const BASE = 28   // % de RAM que o editor e o navegador já usam
const HUES = [['#E9FEFF', '#7DF9FF', '#8B6CFF'], ['#F4EEFF', '#C7B2FF', '#7B5CFF'], ['#FFF0FA', '#FFB3E6', '#9B6CFF'], ['#E9FFF4', '#7DFFC4', '#5C8BFF']]
const spring = { type: 'spring', stiffness: 120, damping: 11, mass: 0.9 } as const

function level(pct: number) { return JAR.y + JAR.h - (JAR.h * Math.min(100, pct)) / 100 }

export function RamJar() {
  const [phase, setPhase] = useState<Phase>('fill')
  const [n, setN] = useState(0)
  const [auto, setAuto] = useState(true)
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pct = phase === 'fill' ? BASE + n * 19 : BASE
  const full = phase === 'fill' && n >= 4
  const hot = pct >= 85

  const next = useCallback(() => {
    if (phase === 'fill' && n < 4) setN((k) => k + 1)
    else if (phase === 'fill') setPhase('split')
    else if (phase === 'split') setPhase('done')
    else { setPhase('fill'); setN(0) }
  }, [phase, n])

  // piloto automático até a pessoa clicar; volta depois de 9 s parada
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(next, phase === 'fill' ? (n < 4 ? 900 : 1900) : phase === 'split' ? 2600 : 2600)
    return () => clearTimeout(t)
  }, [auto, next, phase, n])
  const press = () => {
    setAuto(false); next()
    clearTimeout(idle.current); idle.current = setTimeout(() => setAuto(true), 9000)
  }
  useEffect(() => () => clearTimeout(idle.current), [])

  const label = phase === 'fill' ? (full ? '✦ Uma máquina para cada' : `＋ Subagente  ${n}/4`) : phase === 'split' ? '✓ Entregar e evaporar' : '↺ De novo'
  const caption = phase === 'fill'
    ? (full ? <>Transbordou. Quatro subagentes rodando <b>testes, build e navegador</b> não cabem nos seus 16 GB.</> : <>Cada subagente que roda testes, build ou navegador <b>come gigas da sua RAM</b>. Solte mais um.</>)
    : phase === 'split' ? <>Com ramwisp, cada um ganha <b>uma máquina própria na nuvem</b>, com 8 GB só dele. Seu computador volta a respirar.</>
      : <>A resposta volta para você e as máquinas <b>evaporam</b>. Nada fica ligado, nada fica guardado.</>

  const ghostPos = (i: number): [number, number] => {
    if (phase === 'fill') return i < n ? (PACK[i] as [number, number]) : [320, 150]
    if (phase === 'split') return SLOTS[i] as [number, number]
    return [SLOTS[i][0], SLOTS[i][1] - 30]
  }

  return (
    <div className="jar-wrap">
      <motion.svg viewBox="0 0 640 540" className="jar-svg" role="img" aria-label="Brinquedo: subagentes enchem a RAM do seu computador até transbordar e depois se separam em máquinas próprias"
        animate={full ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }} transition={full ? { repeat: Infinity, duration: 0.5, repeatDelay: 0.6 } : {}}>
        <defs>
          <GooFilter id="jargoo" blur={11} sharp={26} />
          {HUES.map((h, i) => (
            <linearGradient key={i} id={`gh${i}`} x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stopColor={h[0]} /><stop offset=".5" stopColor={h[1]} /><stop offset="1" stopColor={h[2]} /></linearGradient>
          ))}
          <linearGradient id="liq-ok" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5EF2C0" stopOpacity=".95" /><stop offset="1" stopColor="#2B7BFF" stopOpacity=".7" /></linearGradient>
          <linearGradient id="liq-hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF6B9A" /><stop offset="1" stopColor="#FF9A3C" stopOpacity=".85" /></linearGradient>
          <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".22" /><stop offset="1" stopColor="#ffffff" stopOpacity=".04" /></linearGradient>
          <clipPath id="jarclip"><rect x={JAR.x + 6} y={JAR.y - 200} width={JAR.w - 12} height={JAR.h + 194} rx="34" /></clipPath>
        </defs>

        {/* bolhas de máquina (a nuvem) */}
        <AnimatePresence>
          {phase !== 'fill' && SLOTS.map(([x, y], i) => (
            <motion.g key={`b${i}`} initial={{ scale: 0, opacity: 0 }} animate={phase === 'done' ? { scale: [1, 1.25], opacity: [1, 0] } : { scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }} transition={phase === 'done' ? { delay: 1.1 + i * 0.12, duration: 0.45 } : { ...spring, delay: 0.15 + i * 0.08 }} style={{ transformOrigin: `${x}px ${y}px` }}>
              <circle cx={x} cy={y} r="62" fill="url(#glass)" stroke={`url(#gh${i})`} strokeWidth="2.5" />
              <text x={x} y={y + 86} textAnchor="middle" className="jar-mono">8 GB</text>
            </motion.g>
          ))}
        </AnimatePresence>
        {/* estouro das bolhas */}
        {phase === 'done' && SLOTS.flatMap(([x, y], i) => Array.from({ length: 10 }, (_, k) => {
          const a = (k / 10) * Math.PI * 2
          return <motion.circle key={`p${i}-${k}`} r="4" fill={HUES[i][1]} initial={{ cx: x, cy: y, opacity: 0 }}
            animate={{ cx: x + Math.cos(a) * 90, cy: y + Math.sin(a) * 90, opacity: [0, 1, 0] }} transition={{ delay: 1.15 + i * 0.12, duration: 0.8, ease: 'easeOut' }} />
        }))}

        {/* pote = a RAM do seu computador */}
        <g>
          <g clipPath="url(#jarclip)">
            <motion.g animate={{ y: level(pct) - JAR.y }} transition={{ type: 'spring', stiffness: 60, damping: 12 }}>
              <motion.path fill={hot ? 'url(#liq-hot)' : 'url(#liq-ok)'}
                animate={{ d: [
                  `M${JAR.x - 40} ${JAR.y + 6} q 40 -14 80 0 t 80 0 t 80 0 t 80 0 V ${JAR.y + 420} H ${JAR.x - 40} Z`,
                  `M${JAR.x - 40} ${JAR.y + 6} q 40 14 80 0 t 80 0 t 80 0 t 80 0 V ${JAR.y + 420} H ${JAR.x - 40} Z`,
                  `M${JAR.x - 40} ${JAR.y + 6} q 40 -14 80 0 t 80 0 t 80 0 t 80 0 V ${JAR.y + 420} H ${JAR.x - 40} Z`,
                ] }} transition={{ repeat: Infinity, duration: hot ? 0.9 : 2.4, ease: 'easeInOut' }} />
            </motion.g>
          </g>
          <rect x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx="40" fill="url(#glass)" stroke={hot ? '#FF6B9A' : 'rgba(255,255,255,.35)'} strokeWidth="3" />
          <rect x={JAR.x + 18} y={JAR.y + 18} width="10" height={JAR.h - 60} rx="5" fill="#fff" opacity=".18" />
          <text x={JAR.x + JAR.w / 2} y={JAR.y + JAR.h + 34} textAnchor="middle" className="jar-mono">sua RAM · 16 GB</text>
          <motion.text key={Math.round(pct)} x={JAR.x + JAR.w + 22} y={level(pct) + 8} className={`jar-pct ${hot ? 'hot' : ''}`}
            initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>{Math.min(100, Math.round(pct))}%</motion.text>
        </g>

        {/* fantasminhas líquidos: o goo funde os que se encostam */}
        <g filter="url(#jargoo)">
          {[0, 1, 2, 3].map((i) => {
            const [x, y] = ghostPos(i)
            return (
              <motion.g key={i} initial={{ x: 320, y: 150, opacity: 0 }} animate={{ x, y, opacity: phase === 'done' || (phase === 'fill' && i >= n) ? 0 : 1, scaleY: full ? 0.86 : 1, scaleX: full ? 1.1 : 1 }}
                transition={phase === 'done' ? { ...spring, opacity: { delay: 1.0 + i * 0.12, duration: 0.3 } } : { ...spring, delay: phase === 'split' ? i * 0.12 : 0 }}>
                <circle r="44" cy="-8" fill={`url(#gh${i})`} />
                <rect x="-44" y="-8" width="88" height="38" fill={`url(#gh${i})`} />
                {[-30, -10, 10, 30].map((dx, k) => (
                  <motion.circle key={dx} cx={dx} r="11.5" fill={`url(#gh${i})`} animate={{ cy: [32, 41 + (k % 2) * 4, 32] }} transition={{ repeat: Infinity, duration: 1.3 + k * 0.1, delay: k * 0.15 }} />
                ))}
              </motion.g>
            )
          })}
        </g>
        {/* rostos por cima (fora do goo, para ficarem nítidos) */}
        {[0, 1, 2, 3].map((i) => {
          const [x, y] = ghostPos(i)
          const sad = phase === 'fill' && n >= 3
          return (
            <motion.g key={`f${i}`} initial={{ x: 320, y: 150, opacity: 0 }} animate={{ x, y, opacity: phase === 'done' || (phase === 'fill' && i >= n) ? 0 : 1 }}
              transition={phase === 'done' ? { ...spring, opacity: { delay: 1.0 + i * 0.12, duration: 0.3 } } : { ...spring, delay: phase === 'split' ? i * 0.12 : 0 }}>
              {phase === 'fill' ? (
                <>
                  <ellipse cx="-13" cy={sad ? -2 : -6} rx="5.5" ry="7" fill="#0A0C16" /><ellipse cx="13" cy={sad ? -2 : -6} rx="5.5" ry="7" fill="#0A0C16" />
                  <circle cx="-11" cy={sad ? -5 : -9} r="2" fill="#fff" /><circle cx="15" cy={sad ? -5 : -9} r="2" fill="#fff" />
                  {sad ? <path d="M-8 16q8-7 16 0" stroke="#0A0C16" strokeWidth="4" fill="none" strokeLinecap="round" /> : <path d="M-5 10q5 4 10 0" stroke="#0A0C16" strokeWidth="3.5" fill="none" strokeLinecap="round" />}
                </>
              ) : (
                <>
                  <g stroke="#0A0C16" strokeWidth="4.5" strokeLinecap="round" fill="none"><path d="M-19 -4q6-7 11 0" /><path d="M8 -4q6-7 11 0" /></g>
                  <path d="M-7 8q7 7 14 0" stroke="#0A0C16" strokeWidth="4" fill="none" strokeLinecap="round" />
                  <g fill="#FF7DC0" opacity=".55"><ellipse cx="-24" cy="6" rx="5" ry="3" /><ellipse cx="24" cy="6" rx="5" ry="3" /></g>
                </>
              )}
            </motion.g>
          )
        })}
        {/* respostas pingando de volta no pote */}
        {phase === 'done' && SLOTS.map(([x], i) => (
          <motion.circle key={`r${i}`} r="9" fill="#5EF2C0" initial={{ cx: x, cy: 120, opacity: 0 }}
            animate={{ cx: 290 + i * 20, cy: level(BASE) + 10, opacity: [0, 1, 1, 0] }} transition={{ delay: 0.2 + i * 0.15, duration: 0.9, ease: [0.5, 0, 0.9, 0.5] }} />
        ))}
        {full && <motion.text x="320" y="228" textAnchor="middle" className="jar-alert" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 0.7 }}>RAM CHEIA</motion.text>}
      </motion.svg>

      <div className="jar-ui">
        <motion.button className={`btn ${full ? 'primary' : ''} jelly lg`} onClick={press} whileTap={{ scaleX: 1.12, scaleY: 0.86 }} whileHover={{ scale: 1.04 }}
          transition={{ type: 'spring', stiffness: 500, damping: 12 }} animate={full ? { scale: [1, 1.06, 1] } : {}} >
          {label}
        </motion.button>
        <AnimatePresence mode="wait">
          <motion.p key={`${phase}${full}`} className="jar-caption" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>{caption}</motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}
