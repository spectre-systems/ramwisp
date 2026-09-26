import { motion } from 'motion/react'

const BODY = 'M14 30 C14 17.5 21.5 9 32 9 C42.5 9 50 17.5 50 30 V53.8 Q50 55 48.8 55 H46.2 Q45.0 55 45.0 53.8 V49.5 Q45.0 48.5 44.0 48.5 H43.25 Q42.25 48.5 42.25 49.5 V53.8 Q42.25 55 41.05 55 H38.45 Q37.25 55 37.25 53.8 V49.5 Q37.25 48.5 36.25 48.5 H35.5 Q34.5 48.5 34.5 49.5 V53.8 Q34.5 55 33.3 55 H30.7 Q29.5 55 29.5 53.8 V49.5 Q29.5 48.5 28.5 48.5 H27.75 Q26.75 48.5 26.75 49.5 V53.8 Q26.75 55 25.55 55 H22.95 Q21.75 55 21.75 53.8 V49.5 Q21.75 48.5 20.75 48.5 H20.0 Q19.0 48.5 19.0 49.5 V53.8 Q19.0 55 17.8 55 H15.2 Q14.0 55 14.0 53.8 Z'
const PADS = [15.1, 22.85, 30.6, 38.35, 46.1]

export type Mood = 'calm' | 'happy' | 'sad' | 'work' | 'sleep'

/**
 * O fantasminha (spectre) que representa um subagente. O humor mostra o estado dele:
 * sad = apertado sem RAM / na fila · happy = ganhou espaço · work = trabalhando · sleep = subindo · calm = neutro.
 */
export function Ghost({ mood = 'calm', size = 44, hue = 0, float = true, className }: {
  mood?: Mood; size?: number; hue?: 0 | 1 | 2; float?: boolean; className?: string
}) {
  const fill = ['var(--ghost-a)', 'var(--ghost-b)', 'var(--ghost-c)'][hue]
  const body = BODY
  return (
    <motion.svg viewBox="8 4 48 56" width={size} height={size * 60 / 56} className={className} aria-hidden
      animate={float ? { y: mood === 'sad' ? [0, 1, 0] : [0, -3, 0] } : undefined}
      transition={{ repeat: Infinity, duration: mood === 'sad' ? 1.2 : 2.6, ease: 'easeInOut', delay: hue * 0.4 }}
      style={{ overflow: 'visible', filter: mood === 'sad' ? 'saturate(.55)' : 'drop-shadow(0 0 10px color-mix(in oklab, var(--wisp) 45%, transparent))' }}>
      <path d={body} fill={fill} stroke="var(--ghost-line)" strokeWidth="1.2" />
      {PADS.map((x) => <rect key={x} x={x} y="50.6" width="4.6" height="3" rx=".8" fill="var(--ghost-pad)" />)}
      <g transform="translate(4 2)">
      {/* olhos */}
      {mood === 'happy' && <g stroke="var(--ghost-ink)" strokeWidth="2.6" strokeLinecap="round" fill="none"><path d="M18 27q3-4 6 0" /><path d="M32 27q3-4 6 0" /></g>}
      {mood === 'sleep' && <g stroke="var(--ghost-ink)" strokeWidth="2.4" strokeLinecap="round"><path d="M18 27h6" /><path d="M32 27h6" /></g>}
      {mood === 'calm' && <g fill="var(--ghost-ink)"><circle cx="21" cy="26" r="3" /><circle cx="35" cy="26" r="3" /></g>}
      {mood === 'work' && <g fill="var(--ghost-ink)"><circle cx="21" cy="28" r="3" /><circle cx="35" cy="28" r="3" /></g>}
      {mood === 'sad' && <g>
        <g fill="var(--ghost-ink)"><circle cx="21" cy="27" r="3" /><circle cx="35" cy="27" r="3" /></g>
        <g stroke="var(--ghost-ink)" strokeWidth="2" strokeLinecap="round"><path d="M17 21l6 2.5" /><path d="M39 21l-6 2.5" /></g>
      </g>}
      {/* boca */}
      {mood === 'happy' && <path d="M23 34q5 5 10 0" stroke="var(--ghost-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
      {mood === 'calm' && <path d="M25 34q3 2 6 0" stroke="var(--ghost-ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
      {mood === 'work' && <ellipse cx="28" cy="35" rx="2.2" ry="1.8" fill="var(--ghost-ink)" />}
      {mood === 'sleep' && <text x="40" y="12" fontSize="9" fill="var(--wisp)" fontFamily="var(--mono)">z</text>}
      {mood === 'sad' && <>
        <path d="M23 36q5-4 10 0" stroke="var(--ghost-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <motion.path d="M44 14q2 4 0 6q-2-2 0-6z" fill="#8fd3ff" animate={{ y: [0, 6], opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 1.1 }} />
      </>}
      {(mood === 'happy' || mood === 'calm') && <g fill="var(--wisp-3)" opacity=".45"><ellipse cx="15" cy="32" rx="3" ry="1.8" /><ellipse cx="41" cy="32" rx="3" ry="1.8" /></g>}
      </g>
    </motion.svg>
  )
}

/** Logotipo: o símbolo (fantasminha com contatos de RAM) + "ram" leve + "wisp" forte, em Unbounded. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <img src="/mark.svg" alt="" className="wm-mark mark-dark" />
      <img src="/mark-light.svg" alt="" className="wm-mark mark-light" />
      <span><span className="wm-ram">ram</span>wisp</span>
    </span>
  )
}
