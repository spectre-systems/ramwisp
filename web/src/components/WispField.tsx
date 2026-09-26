import { useEffect, useRef } from 'react'

/**
 * Campo de "wisps": partículas luminosas subindo em correntes suaves, atraídas pelo cursor.
 * Canvas 2D, ~180 partículas, pausa fora da tela e respeita prefers-reduced-motion.
 */
export function WispField({ density = 1, className }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, t = 0
    const mouse = { x: -9999, y: -9999 }
    type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; hue: number; trail: [number, number][] }
    let ps: P[] = []

    const css = getComputedStyle(document.documentElement)
    const colors = () => [css.getPropertyValue('--wisp').trim() || '#7df9ff', css.getPropertyValue('--wisp-2').trim() || '#b69cff', css.getPropertyValue('--wisp-3').trim() || '#ffb3e6']
    let palette = colors()

    const spawn = (initial = false): P => {
      const max = 400 + Math.random() * 700
      return {
        x: Math.random() * w, y: initial ? Math.random() * h : h + 20, vx: 0, vy: -(0.25 + Math.random() * 0.6),
        r: 0.6 + Math.random() * 1.8, life: initial ? Math.random() * max : 0, max, hue: Math.floor(Math.random() * 3), trail: [],
      }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = rect.width; h = rect.height
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(Math.min(220, (w * h) / 7000) * density)
      ps = Array.from({ length: n }, () => spawn(true))
      palette = colors()
    }

    // "ruído" barato: soma de senos, suficiente para correntes orgânicas
    const flow = (x: number, y: number) =>
      Math.sin(x * 0.004 + t * 0.0006) * 0.6 + Math.sin(y * 0.006 - t * 0.0004) * 0.4 + Math.cos((x + y) * 0.002 + t * 0.0003) * 0.5

    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (!visible) return
      t += 16
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        const a = flow(p.x, p.y)
        p.vx += Math.cos(a * Math.PI) * 0.02
        p.vx *= 0.97
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d2 = dx * dx + dy * dy
        if (d2 < 160 * 160) { const f = (1 - Math.sqrt(d2) / 160) * 0.06; p.vx += dx * f * 0.02; p.vy += dy * f * 0.02 }
        p.vy = p.vy * 0.99 - 0.004
        p.x += p.vx; p.y += p.vy; p.life++
        p.trail.push([p.x, p.y]); if (p.trail.length > 14) p.trail.shift()
        const k = Math.sin((p.life / p.max) * Math.PI)
        const col = palette[p.hue]
        if (p.trail.length > 2) {
          ctx.beginPath(); ctx.moveTo(p.trail[0][0], p.trail[0][1])
          for (const [tx, ty] of p.trail) ctx.lineTo(tx, ty)
          ctx.strokeStyle = col; ctx.globalAlpha = 0.08 * k; ctx.lineWidth = p.r * 1.4; ctx.stroke()
        }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7)
        g.addColorStop(0, col); g.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.55 * k; ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 7, 0, Math.PI * 2); ctx.fill()
        if (p.life > p.max || p.y < -30 || p.x < -40 || p.x > w + 40) ps[i] = spawn()
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    }

    const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top }
    const onLeave = () => { mouse.x = mouse.y = -9999 }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(canvas)
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    const mo = new MutationObserver(() => { palette = colors() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    if (reduce) { for (let i = 0; i < 60; i++) { t += 16 } frame(); cancelAnimationFrame(raf) } else frame()
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); mo.disconnect()
      window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [density])

  return <canvas ref={ref} className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden />
}
