import { GhostMark } from './Mark'
import type { Mood } from './LiquidGhost'

export type { Mood }

/** O subagente é um fantasminha líquido; o humor mostra o estado dele. */
export function Ghost({ mood = 'calm', size = 44, className }: { mood?: Mood; size?: number; hue?: 0 | 1 | 2; float?: boolean; className?: string }) {
  // traço único, como a logo: ciano trabalhando, branco pronto, apagado esperando
  const color = mood === 'work' ? 'var(--acc)' : mood === 'sleep' ? 'var(--faint)' : mood === 'sad' ? 'var(--err)' : 'var(--text)'
  return <span className={`ghost-ico ${mood} ${className ?? ''}`}><GhostMark size={size} stroke={color} eyes={color} weight={3} /></span>
}

/** Logotipo: marca de traço + "ramwisp" em grotesca condensada. */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <GhostMark size={Math.round(size * 1.35)} />
      <span>RAMWISP</span>
    </span>
  )
}
