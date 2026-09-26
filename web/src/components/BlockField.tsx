import { useEffect, useRef } from 'react'
import { WORLD } from './worldmap'

/**
 * Fundo de blocos (canvas) com o mapa-múndi desenhado em células. Anima sozinho:
 *  - uma onda de brilho atravessa os continentes devagar;
 *  - pulsos ciano saem de cidades pelo mundo e viajam em blocos até us-east-1 (subagentes indo para as máquinas);
 *  - ao chegar, um anel pulsa no hub e um pacote dourado volta para a cidade (a resposta).
 * O mouse continua acendendo blocos por onde passa, com rastro.
 */
const CELL = 14, GAP = 3
const MW = WORLD[0].length, MH = WORLD.length
const LAT_TOP = 78, LAT_BOT = -58
const geo = (lon: number, lat: number) => [(lon + 180) / 360, (LAT_TOP - lat) / (LAT_TOP - LAT_BOT)] as const
const HUB = geo(-77.5, 39)                                   // us-east-1
const CITIES = [
  geo(-122.4, 37.8), geo(-46.6, -23.5), geo(-0.1, 51.5), geo(13.4, 52.5), geo(3.4, 6.5), geo(77.6, 13),
  geo(139.7, 35.7), geo(151.2, -33.9), geo(103.8, 1.3), geo(-99.1, 19.4), geo(-58.4, -34.6), geo(18.4, -33.9),
]

type Packet = { from: readonly [number, number]; to: readonly [number, number]; t: number; speed: number; gold: boolean; city: number }

export function BlockField({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cols = 0, rows = 0, raf = 0, last = 0, t = 0
    let heat = new Float32Array(0)      // mouse (branco → ciano)
    let fx = new Float32Array(0)        // efeitos (pulsos, anéis) — intensidade
    let fxc = new Uint8Array(0)         // cor do efeito: 1 ciano, 2 dourado
    let land = new Uint8Array(0)
    let seed = new Float32Array(0)
    let packets: Packet[] = []
    let rings: { r: number; life: number }[] = []
    const mouse = { x: -1e4, y: -1e4, inside: false }

    const resize = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = r.width * dpr; cv.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(r.width / CELL); rows = Math.ceil(r.height / CELL)
      const n = cols * rows
      heat = new Float32Array(n); fx = new Float32Array(n); fxc = new Uint8Array(n)
      seed = Float32Array.from({ length: n }, () => Math.random())
      land = new Uint8Array(n)
      for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
        const mx = Math.floor((c / cols) * MW), my = Math.floor((rr / rows) * MH)
        land[rr * cols + c] = WORLD[my]?.[mx] === '#' ? 1 : 0
      }
    }
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top
      mouse.inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= r.width && mouse.y <= r.height
    }
    const cellOf = (p: readonly [number, number]) => [Math.floor(p[0] * cols), Math.floor(p[1] * rows)] as const
    const lit = (c: number, r: number, v: number, color: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return
      const i = r * cols + c
      if (v >= fx[i]) { fx[i] = v; fxc[i] = color }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - last < 1000 / 30) return
      last = now; t++
      ctx.clearRect(0, 0, cols * CELL, rows * CELL)

      // novos subagentes saindo de cidades (um a cada ~0,7 s)
      if (t % 21 === 0 && packets.length < 10) {
        const city = Math.floor(Math.random() * CITIES.length)
        packets.push({ from: CITIES[city], to: HUB, t: 0, speed: 0.012 + Math.random() * 0.01, gold: false, city })
      }
      // move pacotes: linha reta com leve arco, cabeça forte e rastro que apaga
      packets = packets.filter((p) => {
        p.t += p.speed
        const k = Math.min(1, p.t)
        for (let s = 0; s < 6; s++) {
          const kk = Math.max(0, k - s * 0.02)
          const x = p.from[0] + (p.to[0] - p.from[0]) * kk
          const y = p.from[1] + (p.to[1] - p.from[1]) * kk - Math.sin(kk * Math.PI) * 0.08
          const [c, r] = cellOf([x, y])
          lit(c, r, s === 0 ? 1 : 0.7 - s * 0.1, p.gold ? 2 : 1)
        }
        if (p.t >= 1) {
          if (!p.gold) {
            rings.push({ r: 0, life: 1 })
            packets.push({ from: HUB, to: CITIES[p.city], t: 0, speed: p.speed * 1.3, gold: true, city: p.city })
          } else {
            const [c, r] = cellOf(CITIES[p.city]); lit(c, r, 1, 2)
          }
          return false
        }
        return true
      })
      // anéis pulsando no hub e o próprio hub
      const [hc, hr] = cellOf(HUB)
      rings = rings.filter((g) => {
        g.r += 0.45; g.life -= 0.05
        for (let a = 0; a < 28; a++) {
          const ang = (a / 28) * Math.PI * 2
          lit(Math.round(hc + Math.cos(ang) * g.r), Math.round(hr + Math.sin(ang) * g.r * 0.9), g.life * 0.8, 1)
        }
        return g.life > 0
      })
      lit(hc, hr, 0.75 + 0.25 * Math.sin(t * 0.3), 1)
      // cidades acesas de leve
      for (const cp of CITIES) { const [c, r] = cellOf(cp); lit(c, r, 0.35, 2) }

      const mc = Math.floor(mouse.x / CELL), mr = Math.floor(mouse.y / CELL)
      const sweep = (t * 0.35) % (cols + 30) - 15                   // onda de brilho atravessando o mapa
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (mouse.inside) {
          const d = Math.hypot(c - mc, r - mr)
          if (d < 5) heat[i] = Math.max(heat[i], 1 - d / 5)
        }
        heat[i] *= 0.93
        fx[i] *= 0.86
        let base = 0.03
        if (land[i]) {
          const w = Math.max(0, 1 - Math.abs(c - sweep) / 9)
          base = 0.1 + w * 0.14 + (seed[i] > 0.97 ? 0.05 * (1 + Math.sin(t * 0.2 + seed[i] * 40)) : 0)
        }
        const m = Math.min(1, base + heat[i] * intensity)
        const e = fx[i]
        let color: string | null = null
        if (e > 0.12) {
          const q = Math.round(e * 4) / 4
          color = fxc[i] === 2 ? `rgba(251,191,36,${0.25 + 0.7 * q})` : `rgba(95,245,255,${0.25 + 0.7 * q})`
        } else {
          const q = Math.round(m * 8) / 8                              // brilho em degraus: cara de blocos
          if (q <= 0) continue
          color = q >= 0.75 ? `rgba(95,245,255,${0.55 * q})` : `rgba(255,255,255,${q * 0.9})`
        }
        ctx.fillStyle = color
        ctx.fillRect(c * CELL + GAP / 2, r * CELL + GAP / 2, CELL - GAP, CELL - GAP)
      }
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove)
    if (reduce) { frame(1000); cancelAnimationFrame(raf) } else raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove) }
  }, [intensity])
  return <canvas ref={ref} className={`block-field ${className ?? ''}`} aria-hidden />
}
