import { PixelGhost, type Mood } from './PixelGhost'

export type { Mood }

/** O subagente é um fantasminha em pixel art; o humor mostra o estado dele. */
export function Ghost({ mood = 'calm', size = 44, hue = 0, className }: { mood?: Mood; size?: number; hue?: 0 | 1 | 2; float?: boolean; className?: string }) {
  return <PixelGhost mood={mood} size={size} hue={hue} className={className} />
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
