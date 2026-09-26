import { useEffect, useRef } from 'react'

export type Mood = 'calm' | 'happy' | 'sad' | 'work' | 'sleep'

/**
 * Fantasminha em pixel art (16×18), desenhado em canvas sem suavização.
 * Corpo redondo, barra de "contatos de RAM" com pontas douradas, sombra à direita, contorno escuro.
 * 2 quadros por humor, trocados a ~3 fps (como sprite de verdade); flutua em degraus de 1 pixel.
 */
const W = 16, H = 18
const TINTS = [
  { hi: '#ffffff', a: '#dffcff', b: '#9ff0ff', c: '#62cfe8', d: '#8b7cf0' },   // ciano
  { hi: '#ffffff', a: '#efe9ff', b: '#cdbdff', c: '#9d86f5', d: '#7a64e0' },   // lilás
  { hi: '#ffffff', a: '#ffeef8', b: '#ffc9e8', c: '#f39acd', d: '#b77be8' },   // rosa
]
const SAD = { hi: '#f4f7fb', a: '#d9e6f2', b: '#bfd0e3', c: '#93a9c6', d: '#7f8fc0' }   // pálido, não cinza-caveira
const INK = '#141827', GOLD = '#f6c85f', GOLD_D = '#c48a2c', BLUSH = '#ff8fbf', TEAR = '#8fd8ff'

type Px = string | null

// corpo desenhado à mão: [início, fim] de cada linha (colunas 1..14; 0 e 15 ficam para o contorno)
const ROWS: [number, number][] = [
  [-1, -2], [5, 10], [3, 12], [2, 13], [2, 13], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14],
  [1, 14], [1, 14], [1, 14], [1, 14],
]
// 5 dentes de 2 px com 1 px de vão = os contatos do pente de RAM; no quadro 1 alternam o comprimento
const TEETH = [1, 4, 7, 10, 13]

function body(frame: number): boolean[][] {
  const g: boolean[][] = Array.from({ length: H }, () => Array(W).fill(false))
  ROWS.forEach(([a, b], y) => { for (let x = a; x <= b; x++) g[y][x] = true })
  TEETH.forEach((x0, k) => {
    const last = frame === 0 ? 15 : k % 2 ? 16 : 14
    for (let y = 14; y <= last; y++) { g[y][x0] = true; g[y][x0 + 1] = true }
  })
  return g
}

function sprite(mood: Mood, frame: number, tint: number): Px[][] {
  const t = mood === 'sad' ? SAD : TINTS[tint]
  const m = body(frame)
  const px: Px[][] = Array.from({ length: H }, () => Array(W).fill(null))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y][x]) continue
    const right = !m[y][x + 1] || !m[y][x + 2]
    let c = t.a
    if (y >= 11) c = t.b
    if (right) c = t.c
    if (y >= 14 && (right || y >= 15)) c = t.d
    if (y >= 15 && y === lastRow(m, x)) c = (x % 3 === 0 ? GOLD : GOLD_D)   // pontas douradas dos contatos
    if ((y === 2 && x >= 4 && x <= 5) || (y === 3 && x === 3)) c = t.hi         // brilho no alto da cabeça
    px[y][x] = c
  }
  // contorno: vizinho vazio de um pixel do corpo
  const out = px.map((r) => r.slice())
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y][x]) continue
    if (px[y - 1]?.[x] || px[y + 1]?.[x] || px[y][x - 1] || px[y][x + 1]) out[y][x] = INK
  }
  face(out, mood, frame)
  return out
}

function lastRow(m: boolean[][], x: number) {
  for (let y = H - 1; y >= 0; y--) if (m[y][x]) return y
  return -1
}

function set(px: Px[][], pts: [number, number][], c: string) {
  for (const [x, y] of pts) if (px[y] && x >= 0 && x < W) px[y][x] = c
}

function face(px: Px[][], mood: Mood, frame: number) {
  const blink = frame === 1 && mood === 'calm'
  switch (mood) {
    case 'calm':
      if (blink) set(px, [[5, 8], [6, 8], [10, 8], [11, 8]], INK)
      else { set(px, [[5, 7], [6, 7], [5, 8], [6, 8], [10, 7], [11, 7], [10, 8], [11, 8]], INK); set(px, [[5, 7], [10, 7]], '#ffffff') }
      set(px, [[8, 10]], INK)
      break
    case 'happy':
      set(px, [[4, 8], [5, 7], [6, 7], [7, 8], [9, 8], [10, 7], [11, 7], [12, 8]], INK)
      set(px, [[7, 10], [8, 11], [9, 10]], INK)
      set(px, [[3, 10], [13, 10]], BLUSH)
      break
    case 'work':
      set(px, [[5, 9], [6, 9], [10, 9], [11, 9], [5, 8], [10, 8]], INK)
      set(px, [[8, 11]], INK)
      if (frame === 1) set(px, [[13, 3]], TEAR)       // gotinha de esforço
      break
    case 'sleep':
      set(px, [[5, 8], [6, 8], [10, 8], [11, 8]], INK)
      set(px, [[8, 10]], INK)
      break
    case 'sad':
      set(px, [[5, 8], [5, 9], [10, 8], [10, 9]], INK)                  // olhinhos
      set(px, [[4, 6], [6, 7], [11, 6], [9, 7]], INK)                   // sobrancelhas caídas
      set(px, [[7, 11], [8, 11], [6, 12], [9, 12]], INK)                // boca triste
      set(px, [[4, frame ? 11 : 10]], TEAR)                             // lágrima descendo
      break
  }
}

const cache = new Map<string, HTMLCanvasElement>()
export function spriteCanvas(mood: Mood, frame: number, tint: number) {
  const key = `${mood}:${frame}:${tint}`
  let c = cache.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const px = sprite(mood, frame, tint)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!px[y][x]) continue
    ctx.fillStyle = px[y][x]!; ctx.fillRect(x, y, 1, 1)
  }
  cache.set(key, c)
  return c
}

export function PixelGhost({ mood = 'calm', size = 48, hue = 0, animate = true, className }: {
  mood?: Mood; size?: number; hue?: 0 | 1 | 2; animate?: boolean; className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = Math.max(1, Math.round(size / W))
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    let f = 0, tick = 0, raf = 0, last = 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fps = mood === 'work' ? 5 : mood === 'sad' ? 2.5 : 3
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height)
      // flutua em degraus de 1 pixel do sprite (0, -1, -2, -1)
      const bob = mood === 'sad' ? [0, 0, 1, 0][tick % 4] : [0, -1, -2, -1][tick % 4]
      ctx.drawImage(spriteCanvas(mood, f, hue), 0, (2 + bob) * scale, W * scale, H * scale)
    }
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 1000 / fps) return
      last = t; tick++; f = tick % 2
      draw()
    }
    draw()
    if (animate && !reduce) raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mood, hue, scale, animate])
  return (
    <canvas ref={ref} width={W * scale} height={(H + 3) * scale} className={className} aria-hidden
      style={{ width: W * scale, height: (H + 3) * scale, imageRendering: 'pixelated', display: 'block',
        filter: mood === 'sad' ? undefined : 'drop-shadow(0 0 8px color-mix(in oklab, var(--wisp) 45%, transparent))' }} />
  )
}
