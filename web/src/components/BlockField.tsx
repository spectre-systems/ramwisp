import { useEffect, useRef } from 'react'

/**
 * Grade de blocos no fundo (canvas). O mouse "reflete" nela: os blocos perto do cursor acendem e
 * apagam devagar, deixando rastro. De tempos em tempos uma onda em degraus atravessa a grade sozinha.
 */
const CELL = 16, GAP = 3

export function BlockField({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cols = 0, rows = 0, dpr = 1, raf = 0, last = 0, t = 0
    let heat = new Float32Array(0)
    let seed = new Float32Array(0)
    const mouse = { x: -1e4, y: -1e4, inside: false }
    let wave = 0                                             // já abre com uma onda passando

    const resize = () => {
      const r = cv.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = r.width * dpr; cv.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(r.width / CELL); rows = Math.ceil(r.height / CELL)
      heat = new Float32Array(cols * rows)
      seed = Float32Array.from({ length: cols * rows }, () => Math.random())
    }
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top
      mouse.inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= r.width && mouse.y <= r.height
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - last < 1000 / 30) return
      last = now; t++
      const w = cols * CELL, h = rows * CELL
      ctx.clearRect(0, 0, w, h)
      // onda em degraus (coluna por coluna) a cada ~7 s
      if (wave < 0 && t % 75 === 0) wave = 0                     // e outra a cada ~2,5 s
      const mc = Math.floor(mouse.x / CELL), mr = Math.floor(mouse.y / CELL)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (mouse.inside) {
          const d = Math.hypot(c - mc, r - mr)
          if (d < 5) heat[i] = Math.max(heat[i], 1 - d / 5)
        }
        if (wave >= 0 && Math.abs(c + r * 0.5 - wave) < 1.6 && seed[i] > 0.45) heat[i] = Math.max(heat[i], 0.6)
        heat[i] *= 0.93
        const base = seed[i] > 0.985 ? 0.12 : 0.045            // alguns blocos sempre levemente acesos
        const v = Math.min(1, base + heat[i] * intensity)
        // quantiza em 4 níveis: cara de "blocos", sem gradiente contínuo
        const q = Math.round(v * 4) / 4
        if (q <= 0) continue
        ctx.fillStyle = q >= 0.75 ? `rgba(95,245,255,${0.55 * q})` : `rgba(255,255,255,${0.05 + q * 0.18})`
        ctx.fillRect(c * CELL + GAP / 2, r * CELL + GAP / 2, CELL - GAP, CELL - GAP)
      }
      if (wave >= 0) { wave += 1.5; if (wave > cols + rows) wave = -1 }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove)
    if (reduce) { frame(1000); cancelAnimationFrame(raf) } else raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove) }
  }, [intensity])
  return <canvas ref={ref} className={`block-field ${className ?? ''}`} aria-hidden />
}
