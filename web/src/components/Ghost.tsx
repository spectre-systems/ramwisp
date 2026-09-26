import { GhostMark } from './Mark'
import { LiquidGhost, type Mood } from './LiquidGhost'

export type { Mood }

/** O subagente é um fantasminha líquido; o humor mostra o estado dele. */
export function Ghost({ mood = 'calm', size = 44, hue = 0, className }: { mood?: Mood; size?: number; hue?: 0 | 1 | 2; float?: boolean; className?: string }) {
  return <LiquidGhost mood={mood} size={size} hue={hue} className={className} />
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
