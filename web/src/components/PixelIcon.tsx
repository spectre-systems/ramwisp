import type { ReactElement } from 'react'
/** Ícones 8×8 em pixel art (1 = cor principal, 2 = destaque). SVG com crispEdges para não borrar. */
const ICONS: Record<string, string[]> = {
  key: [
    '..111...',
    '.1...1..',
    '.1.2.1..',
    '.1...1..',
    '..111...',
    '...1....',
    '...11...',
    '...1.1..',
  ],
  folder: [
    '........',
    '111.....',
    '1221111.',
    '1222221.',
    '1222221.',
    '1222221.',
    '1111111.',
    '........',
  ],
  note: [
    '111111..',
    '1....11.',
    '1.22..1.',
    '1....1..',
    '1.222.1.',
    '1......1',
    '1.22...1',
    '11111111',
  ],
  lock: [
    '..1111..',
    '.1....1.',
    '.1....1.',
    '11111111',
    '12222221',
    '12211221',
    '12222221',
    '11111111',
  ],
  eye: [
    '........',
    '..1111..',
    '.1....1.',
    '1..22..1',
    '1..22..1',
    '.1....1.',
    '..1111..',
    '........',
  ],
  check: [
    '........',
    '.......1',
    '......11',
    '1....11.',
    '11..11..',
    '.1111...',
    '..11....',
    '........',
  ],
}

export function PixelIcon({ name, size = 16, color = 'currentColor', accent = 'var(--wisp)' }: { name: keyof typeof ICONS | string; size?: number; color?: string; accent?: string }) {
  const rows = ICONS[name] ?? ICONS.check
  const rects: ReactElement[] = []
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '1' || c === '2') rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c === '1' ? color : accent} />)
  }))
  return <svg viewBox="0 0 8 8" width={size} height={size} shapeRendering="crispEdges" aria-hidden style={{ flex: 'none', display: 'inline-block', verticalAlign: '-0.15em' }}>{rects}</svg>
}
