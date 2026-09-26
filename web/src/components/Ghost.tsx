import { LiquidGhost, type Mood } from './LiquidGhost'

export type { Mood }

/** O subagente é um fantasminha líquido; o humor mostra o estado dele. */
export function Ghost({ mood = 'calm', size = 44, hue = 0, className }: { mood?: Mood; size?: number; hue?: 0 | 1 | 2; float?: boolean; className?: string }) {
  return <LiquidGhost mood={mood} size={size} hue={hue} className={className} />
}

/** Logotipo: o símbolo (fantasminha com contatos de RAM) + "ram" leve + "wisp" forte, em Unbounded. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <LiquidGhost mood="calm" size={Math.round(size * 1.35)} className="wm-mark" />
      <span><span className="wm-ram">ram</span>wisp</span>
    </span>
  )
}
