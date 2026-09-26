import { motion } from 'motion/react'

export type Mood = 'calm' | 'happy' | 'sad' | 'work' | 'sleep'

/**
 * O fantasminha (spectre) que representa um subagente. O humor mostra o estado dele:
 * sad = apertado sem RAM / na fila · happy = ganhou espaço · work = trabalhando · sleep = subindo · calm = neutro.
 */
export function Ghost({ mood = 'calm', size = 44, hue = 0, float = true, className }: {
  mood?: Mood; size?: number; hue?: 0 | 1 | 2; float?: boolean; className?: string
}) {
  const fill = ['var(--ghost-a)', 'var(--ghost-b)', 'var(--ghost-c)'][hue]
  const hemA = 'M8 30 Q8 6 28 6 Q48 6 48 30 L48 50 Q44 45 40 50 Q36 55 32 50 Q28 45 24 50 Q20 55 16 50 Q12 45 8 50 Z'
  const hemB = 'M8 30 Q8 6 28 6 Q48 6 48 30 L48 50 Q44 55 40 50 Q36 45 32 50 Q28 55 24 50 Q20 45 16 50 Q12 55 8 50 Z'
  return (
    <motion.svg viewBox="0 0 56 60" width={size} height={size * 60 / 56} className={className} aria-hidden
      animate={float ? { y: mood === 'sad' ? [0, 1, 0] : [0, -3, 0] } : undefined}
      transition={{ repeat: Infinity, duration: mood === 'sad' ? 1.2 : 2.6, ease: 'easeInOut', delay: hue * 0.4 }}
      style={{ overflow: 'visible', filter: mood === 'sad' ? 'saturate(.55)' : 'drop-shadow(0 0 10px color-mix(in oklab, var(--wisp) 45%, transparent))' }}>
      <motion.path fill={fill} stroke="var(--ghost-line)" strokeWidth="1.5"
        animate={{ d: [hemA, hemB, hemA] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }} />
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
    </motion.svg>
  )
}

/** Logotipo: "wisp" em Unbounded com um fantasminha no lugar do pingo do i. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-label="wisp">
      <span aria-hidden>w</span>
      <span className="wm-i" aria-hidden>
        ı
        <svg viewBox="0 0 56 60" className="wm-ghost">
          <path d="M8 30 Q8 6 28 6 Q48 6 48 30 L48 50 Q44 45 40 50 Q36 55 32 50 Q28 45 24 50 Q20 55 16 50 Q12 45 8 50 Z" fill="var(--wisp)" />
          <circle cx="21" cy="26" r="4" fill="var(--bg)" /><circle cx="35" cy="26" r="4" fill="var(--bg)" />
        </svg>
      </span>
      <span aria-hidden>sp</span>
    </span>
  )
}
