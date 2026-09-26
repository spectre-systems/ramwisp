import { useEffect, useRef } from 'react'
import { spriteCanvas, type Mood } from './PixelGhost'

/**
 * A história da primeira tela como cena de jogo em pixel art (240×150, ampliada sem suavização).
 *  falta:   4 subagentes espremidos na tela do notebook, RAM no vermelho tremendo, 1 na fila chorando;
 *  wisp:    eles voam para 4 nuvens, cada uma com sua própria barra de 8 GB; o notebook volta ao verde;
 *  evapora: pacotes de resposta caem no notebook, as nuvens estouram em faíscas, checklist aparece.
 */
export type Act = 'falta' | 'wisp' | 'evapora'
const W = 240, H = 150
const INK = '#141827', FONT = '8px Silkscreen'

type G = { x: number; y: number; tx: number; ty: number; mood: Mood; squash: boolean; hue: 0 | 1 | 2; alpha: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string }
type Packet = { x: number; y: number; tx: number; ty: number; delay: number; done: boolean }

const CLOUD_X = [14, 70, 126, 182]
const CRAM = [[96, 104], [110, 104], [124, 104]]

function targetsFor(act: Act): { x: number; y: number; mood: Mood; squash: boolean; alpha: number }[] {
  if (act === 'falta') return [
    ...CRAM.map(([x, y]) => ({ x, y, mood: 'sad' as Mood, squash: true, alpha: 1 })),
    { x: 200, y: 108, mood: 'sad', squash: false, alpha: 1 },                       // na fila
  ]
  return CLOUD_X.map((x, i) => ({ x: x + 12, y: 14, mood: (act === 'evapora' ? 'happy' : i % 2 ? 'work' : 'happy') as Mood, squash: false, alpha: act === 'evapora' ? 0 : 1 }))
}

function px(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, c: string, align: CanvasTextAlign = 'left') {
  ctx.font = FONT; ctx.textAlign = align; ctx.textBaseline = 'top'
  ctx.fillStyle = c; ctx.fillText(s, Math.round(x), Math.round(y))
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, light: boolean) {
  const f = light ? '#ffffff' : '#3b4a8c', s = light ? '#cfe3f3' : '#26306a', e = light ? '#9fc3dd' : '#6a80d6'
  px(ctx, s, x + 2, y + 9, 40, 2)
  px(ctx, f, x, y + 4, 44, 6); px(ctx, f, x + 6, y + 1, 18, 4); px(ctx, f, x + 20, y - 1, 14, 6)
  px(ctx, e, x, y + 4, 1, 6); px(ctx, e, x + 43, y + 4, 1, 6); px(ctx, e, x + 6, y + 1, 1, 3); px(ctx, e, x + 20, y - 1, 14, 1)
}

function segBar(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, filled: number, color: string, off: string, sw = 5) {
  for (let i = 0; i < n; i++) px(ctx, i < filled ? color : off, x + i * (sw + 1), y, sw, 4)
}

function laptop(ctx: CanvasRenderingContext2D, hot: boolean, shake: number, light: boolean) {
  const x = 56 + shake, y = 86
  const body = light ? '#6c7aa8' : '#39436b', hi = light ? '#94a3d6' : '#56649a', scr = light ? '#e9f3ff' : '#0b1024'
  px(ctx, INK, x - 1, y - 1, 112, 44)                  // contorno da tela
  px(ctx, body, x, y, 110, 42)
  px(ctx, hi, x, y, 110, 1)
  px(ctx, hot ? (light ? '#ffe3e7' : '#2a0d18') : scr, x + 4, y + 4, 102, 34)
  px(ctx, INK, x - 10, y + 43, 130, 7)                 // base
  px(ctx, body, x - 9, y + 43, 128, 5)
  px(ctx, hi, x - 9, y + 43, 128, 1)
  px(ctx, INK, x + 45, y + 45, 20, 1)
}

export function PixelScene({ act }: { act: Act }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const actRef = useRef(act)
  const stateRef = useRef<{ ghosts: G[]; sparks: Spark[]; packets: Packet[]; since: number } | null>(null)

  useEffect(() => { actRef.current = act; if (stateRef.current) stateRef.current.since = performance.now() }, [act])

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = targetsFor('falta')
    stateRef.current = {
      ghosts: start.map((t, i) => ({ x: 250 + i * 12, y: t.y, tx: t.x, ty: t.y, mood: t.mood, squash: t.squash, hue: (i % 3) as 0 | 1 | 2, alpha: 1 })),
      sparks: [], packets: [], since: performance.now(),
    }
    let raf = 0, last = 0, tick = 0, prevAct: Act | null = null
    const light = () => { const t = document.documentElement.dataset.theme; return t ? t === 'light' : matchMedia('(prefers-color-scheme: light)').matches }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 1000 / 24) return
      last = now; tick++
      const st = stateRef.current!, a = actRef.current, L = light()
      const el = (now - st.since) / 1000
      if (a !== prevAct) {
        const tg = targetsFor(a)
        st.ghosts.forEach((g, i) => { g.tx = tg[i].x; g.ty = tg[i].y; g.mood = tg[i].mood; g.squash = tg[i].squash })
        if (a === 'evapora') st.packets = CLOUD_X.map((x, i) => ({ x: x + 18, y: 30, tx: 150 + (i % 2) * 6, ty: 100, delay: i * 0.25, done: false }))
        if (a === 'falta') st.ghosts.forEach((g, i) => { g.alpha = 1; if (prevAct === 'evapora') { g.x = 250 + i * 14; g.y = g.ty } })
        prevAct = a
      }

      ctx.clearRect(0, 0, W, H)
      // nuvens com máquinas (aparecem com o wisp)
      const cloudsOn = a !== 'falta'
      CLOUD_X.forEach((x, i) => {
        const vanish = a === 'evapora' && el > 1.4 + i * 0.15
        if (!cloudsOn) {
          ctx.globalAlpha = 0.35; cloud(ctx, x, 36, L); ctx.globalAlpha = 1
          return
        }
        if (vanish) {
          if (!(st as any)[`poof${i}`]) {
            (st as any)[`poof${i}`] = true
            for (let k = 0; k < 16; k++) st.sparks.push({ x: x + 22, y: 38, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.8 - 0.3, life: 18 + Math.random() * 10, c: ['#9ff0ff', '#cdbdff', '#ffc9e8', '#ffffff'][k % 4] })
          }
          return
        }
        cloud(ctx, x, 36, L)
        text(ctx, '8GB', x + 22, 49, L ? '#35507a' : '#7f8fc0', 'center')
        const fill = a === 'wisp' ? Math.min(6, Math.floor(el * 3) + 1) - (i % 3) : 0
        segBar(ctx, x + 4, 59, 6, Math.max(1, fill), '#5ef2a1', L ? '#c8d8ea' : '#1e2644')
      })
      if (a === 'falta') for (let i = 0; i < 4; i++) delete (st as any)[`poof${i}`]
      if (a === 'wisp') for (let i = 0; i < 4; i++) delete (st as any)[`poof${i}`]

      // notebook
      const hot = a === 'falta'
      const shake = hot && tick % 6 < 2 ? (tick % 2 ? 1 : -1) : 0
      laptop(ctx, hot, shake, L)
      const ram = hot ? 16 : 5
      text(ctx, 'RAM', 62 + shake, 92, L ? '#35507a' : '#9097ad')
      segBar(ctx, 80 + shake, 94, 17, ram, hot ? (tick % 8 < 4 ? '#ff5d73' : '#ffcc66') : '#5ef2a1', L ? '#c8d8ea' : '#1e2644', 4)
      text(ctx, hot ? '97%' : '31%', 162 + shake, 92, hot ? '#ff5d73' : '#5ef2a1', 'right')
      px(ctx, L ? '#b8c6dc' : '#262f55', 62 + shake, 104, 30, 18)       // editor + navegador
      text(ctx, 'IDE', 77 + shake, 110, L ? '#5a6a8a' : '#6d7599', 'center')
      if (hot) text(ctx, 'TESTES BUILD WEB', 132 + shake, 124 - 2, '#ff5d73', 'center')

      // pacotes de resposta voltando
      if (a === 'evapora') for (const p of st.packets) {
        if (el < p.delay) continue
        const k = Math.min(1, (el - p.delay) / 0.9)
        const x = p.x + (p.tx - p.x) * k, y = p.y + (p.ty - p.y) * (k * k)
        if (k < 1) { px(ctx, INK, x - 1, y - 1, 9, 7); px(ctx, '#f6c85f', x, y, 7, 5); px(ctx, '#c48a2c', x, y, 7, 1); px(ctx, '#c48a2c', x + 3, y + 2, 1, 1) }
      }
      // checklist do fim
      if (a === 'evapora') {
        const lines = ['4 RESPOSTAS', 'NUVEM LIMPA', 'NADA GUARDADO']
        lines.forEach((l, i) => { if (el > 2.1 + i * 0.45) text(ctx, '+ ' + l, 120, 26 + i * 12, '#5ef2a1', 'center') })   // onde estavam as nuvens
      }

      // fantasminhas
      for (const g of st.ghosts) {
        const speed = a === 'falta' ? 0.16 : 0.09
        g.x += (g.tx - g.x) * speed; g.y += (g.ty - g.y) * speed
        if (a === 'evapora' && el > 1.2) g.alpha = Math.max(0, g.alpha - 0.05)
        if (g.alpha <= 0) continue
        const f = Math.floor(tick / (g.mood === 'work' ? 5 : 8)) % 2
        const bob = g.squash ? 0 : [0, -1, -2, -1][Math.floor(tick / 6) % 4]
        const moving = Math.abs(g.tx - g.x) + Math.abs(g.ty - g.y) > 3
        ctx.globalAlpha = g.alpha
        const s = spriteCanvas(moving && a !== 'falta' ? 'happy' : g.mood, f, g.hue)
        if (g.squash) ctx.drawImage(s, Math.round(g.x) - 1 + shake, Math.round(g.y) + 3, 18, 15)   // espremido na RAM
        else ctx.drawImage(s, Math.round(g.x), Math.round(g.y + bob))
        ctx.globalAlpha = 1
      }
      if (a === 'falta') {
        text(ctx, 'FILA...', 208, 130, '#ff5d73', 'center')
        if (tick % 16 < 8) text(ctx, '!!', 150 + shake, 100, '#ffcc66')
      }

      // faíscas
      st.sparks = st.sparks.filter((s) => s.life > 0)
      for (const s of st.sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.04; s.life--; px(ctx, s.c, s.x, s.y) }
    }

    document.fonts.load(FONT).finally(() => { raf = requestAnimationFrame(draw) })
    if (reduce) setTimeout(() => cancelAnimationFrame(raf), 1500)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} width={W} height={H} className="pixel-scene" aria-label="Animação: subagentes sem RAM no notebook sobem para máquinas próprias na nuvem e voltam com a resposta" />
}
