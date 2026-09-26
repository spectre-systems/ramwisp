import { useEffect, useRef } from 'react'
import { spriteCanvas } from './PixelGhost'

/**
 * Céu em pixel art atrás da página inteira (canvas em baixa resolução, ampliado sem suavização).
 * Noite: estrelas piscando, estrela cadente de vez em quando, nuvens em 2 camadas de parallax.
 * Dia (tema claro): céu azul, nuvens brancas, sem estrelas. De tempos em tempos um fantasminha atravessa.
 */
const PX = 4   // cada pixel do céu = 4 px de tela

type Cloud = { x: number; y: number; w: number; speed: number; layer: number }
type Star = { x: number; y: number; phase: number; big: boolean }

function isLight() {
  const t = document.documentElement.dataset.theme
  return t ? t === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, fill: string, shade: string) {
  // nuvem em degraus: três "bolhas" retangulares sobrepostas
  const h = Math.max(4, Math.round(w / 4))
  ctx.fillStyle = shade
  ctx.fillRect(x, y + h - 1, w, 2)
  ctx.fillStyle = fill
  ctx.fillRect(x, y + Math.round(h / 2), w, Math.ceil(h / 2))
  ctx.fillRect(x + Math.round(w * 0.15), y + Math.round(h / 4), Math.round(w * 0.45), Math.ceil(h * 0.75))
  ctx.fillRect(x + Math.round(w * 0.45), y, Math.round(w * 0.35), h)
}

export function PixelSky() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, raf = 0, t = 0, last = 0
    let stars: Star[] = [], clouds: Cloud[] = []
    let shooting: { x: number; y: number; life: number } | null = null
    let visitor: { x: number; y: number; dir: number; hue: 0 | 1 | 2 } | null = null

    const resize = () => {
      w = Math.ceil(window.innerWidth / PX); h = Math.ceil(window.innerHeight / PX)
      cv.width = w; cv.height = h
      ctx.imageSmoothingEnabled = false
      stars = Array.from({ length: Math.round((w * h) / 260) }, () => ({ x: Math.floor(Math.random() * w), y: Math.floor(Math.random() * h), phase: Math.random() * 6.28, big: Math.random() < 0.08 }))
      clouds = Array.from({ length: Math.max(4, Math.round(w / 45)) }, (_, i) => ({
        x: Math.random() * w, y: 6 + Math.random() * (h * 0.85), w: 18 + Math.floor(Math.random() * 30), speed: i % 2 ? 0.05 : 0.11, layer: i % 2,
      }))
    }

    const frame = (now: number) => {
      if (!reduce) raf = requestAnimationFrame(frame)
      if (!reduce && now - last < 1000 / 20) return            // 20 fps: cara de jogo antigo
      last = now; t++
      const light = isLight()
      ctx.fillStyle = light ? '#bfe6ff' : '#07080d'
      ctx.fillRect(0, 0, w, h)
      if (light) {
        ctx.fillStyle = '#d6f0ff'; ctx.fillRect(0, Math.floor(h * 0.55), w, h)
      } else {
        for (const s of stars) {
          const on = Math.sin(t * 0.08 + s.phase)
          if (on < -0.6) continue
          ctx.fillStyle = on > 0.8 ? '#dfe8ff' : on > 0 ? '#6f86c9' : '#2a3560'
          ctx.fillRect(s.x, s.y, 1, 1)
          if (s.big && on > 0.7) { ctx.fillStyle = '#5c7bd6'; ctx.fillRect(s.x - 1, s.y, 1, 1); ctx.fillRect(s.x + 1, s.y, 1, 1); ctx.fillRect(s.x, s.y - 1, 1, 1); ctx.fillRect(s.x, s.y + 1, 1, 1) }
        }
        if (!shooting && Math.random() < 0.004) shooting = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.4, life: 0 }
        if (shooting) {
          shooting.life++
          for (let k = 0; k < 6; k++) { ctx.fillStyle = k === 0 ? '#ffffff' : k < 3 ? '#9ff0ff' : '#3b4a78'; ctx.fillRect(Math.round(shooting.x + shooting.life * 2 - k * 2), Math.round(shooting.y + shooting.life - k), 1, 1) }
          if (shooting.life > 28) shooting = null
        }
      }
      for (const c of clouds) {
        c.x += c.speed
        if (c.x > w + 10) { c.x = -c.w - 10; c.y = 6 + Math.random() * (h * 0.85) }
        const fill = light ? (c.layer ? '#ffffff' : '#f2f9ff') : (c.layer ? '#141a33' : '#0f1428')
        const shade = light ? '#d2e6f5' : (c.layer ? '#0d1226' : '#0b0f20')
        drawCloud(ctx, Math.round(c.x), Math.round(c.y), c.w, fill, shade)
      }
      // visitante: um fantasminha atravessando a tela de vez em quando
      if (!visitor && Math.random() < 0.0025) visitor = { x: Math.random() < 0.5 ? -20 : w + 4, y: 10 + Math.random() * h * 0.6, dir: 0, hue: Math.floor(Math.random() * 3) as 0 | 1 | 2 }
      if (visitor) {
        if (!visitor.dir) visitor.dir = visitor.x < 0 ? 1 : -1
        visitor.x += visitor.dir * 0.6
        const bob = [0, -1, -2, -1][Math.floor(t / 4) % 4]
        ctx.globalAlpha = light ? 0.9 : 0.75
        ctx.drawImage(spriteCanvas('happy', Math.floor(t / 6) % 2, visitor.hue), Math.round(visitor.x), Math.round(visitor.y + bob))
        ctx.globalAlpha = 1
        if (visitor.x < -30 || visitor.x > w + 30) visitor = null
      }
    }

    resize()
    window.addEventListener('resize', resize)
    if (reduce) frame(1000); else raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} aria-hidden className="pixel-sky" />
}
