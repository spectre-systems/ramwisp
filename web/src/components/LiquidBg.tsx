import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect } from 'react'

/**
 * Fundo vivo: manchas de gradiente líquidas (desfocadas, girando devagar) e formas geométricas
 * flutuando em profundidades diferentes, reagindo ao mouse (parallax). Fica atrás do conteúdo.
 */
type Shape = { kind: 'ring' | 'pill' | 'tri' | 'plus' | 'square' | 'dot'; x: string; y: string; size: number; depth: number; rot: number; colors: [string, string]; dur: number }

const SHAPES: Shape[] = [
  { kind: 'ring', x: '2%', y: '30%', size: 90, depth: 30, rot: 0, colors: ['#7DF9FF', '#8B6CFF'], dur: 9 },
  { kind: 'pill', x: '86%', y: '14%', size: 120, depth: 50, rot: -24, colors: ['#FFB3E6', '#8B6CFF'], dur: 11 },
  { kind: 'tri', x: '92%', y: '76%', size: 80, depth: 40, rot: 12, colors: ['#FFE066', '#FF7DC0'], dur: 10 },
  { kind: 'plus', x: '3%', y: '84%', size: 56, depth: 60, rot: 0, colors: ['#5EF2C0', '#7DF9FF'], dur: 8 },
  { kind: 'square', x: '52%', y: '4%', size: 44, depth: 25, rot: 20, colors: ['#C7B2FF', '#7DF9FF'], dur: 12 },
  { kind: 'dot', x: '93%', y: '52%', size: 26, depth: 70, rot: 0, colors: ['#FFE066', '#FF9A3C'], dur: 7 },
  { kind: 'dot', x: '46%', y: '94%', size: 18, depth: 80, rot: 0, colors: ['#7DF9FF', '#5EF2C0'], dur: 6 },
]

function ShapeSvg({ s }: { s: Shape }) {
  const id = `sg-${s.kind}-${s.x}`.replace(/[^a-z0-9-]/gi, '')
  const g = <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={s.colors[0]} /><stop offset="1" stopColor={s.colors[1]} /></linearGradient></defs>
  const f = `url(#${id})`
  const v = 100
  const body = {
    ring: <circle cx="50" cy="50" r="38" fill="none" stroke={f} strokeWidth="14" />,
    pill: <rect x="6" y="32" width="88" height="36" rx="18" fill={f} />,
    tri: <path d="M50 8 L92 86 H8 Z" fill={f} strokeLinejoin="round" />,
    plus: <path d="M38 8h24v30h30v24H62v30H38V62H8V38h30z" fill={f} />,
    square: <rect x="14" y="14" width="72" height="72" rx="14" fill={f} />,
    dot: <circle cx="50" cy="50" r="46" fill={f} />,
  }[s.kind]
  return <svg viewBox={`0 0 ${v} ${v}`} width={s.size} height={s.size}>{g}{body}</svg>
}

function Floating({ s, mx, my }: { s: Shape; mx: MotionValue<number>; my: MotionValue<number> }) {
  const x = useTransform(mx, (v) => v * s.depth)
  const y = useTransform(my, (v) => v * s.depth)
  return (
    <motion.div className="geo" style={{ left: s.x, top: s.y, x, y }}>
      <motion.div animate={{ y: [0, -18, 0], rotate: [s.rot, s.rot + 14, s.rot] }} transition={{ repeat: Infinity, duration: s.dur, ease: 'easeInOut' }}>
        <ShapeSvg s={s} />
      </motion.div>
    </motion.div>
  )
}

export function LiquidBg() {
  const mx = useSpring(useMotionValue(0), { stiffness: 40, damping: 14 })
  const my = useSpring(useMotionValue(0), { stiffness: 40, damping: 14 })
  useEffect(() => {
    const on = (e: PointerEvent) => { mx.set(e.clientX / window.innerWidth - 0.5); my.set(e.clientY / window.innerHeight - 0.5) }
    window.addEventListener('pointermove', on)
    return () => window.removeEventListener('pointermove', on)
  }, [mx, my])
  return (
    <div className="liquid-bg" aria-hidden>
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      {SHAPES.map((s, i) => <Floating key={i} s={s} mx={mx} my={my} />)}
      <div className="liquid-noise" />
    </div>
  )
}
