import { motion, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useId, useRef } from 'react'

export type Mood = 'calm' | 'happy' | 'sad' | 'work' | 'sleep'

/** Filtro "goo": borra e endurece o alfa, então formas próximas se fundem como líquido. */
export function GooFilter({ id, blur = 7, sharp = 24 }: { id: string; blur?: number; sharp?: number }) {
  return (
    <filter id={id} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="b" />
      <feColorMatrix in="b" mode="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${sharp} -${sharp / 2.4}`} result="g" />
      <feComposite in="SourceGraphic" in2="g" operator="atop" />
    </filter>
  )
}

/** Olhos que seguem o cursor (compartilhado por todos os fantasminhas da página). */
function useLook(ref: React.RefObject<SVGSVGElement | null>, range = 2.4) {
  const x = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 })
  const y = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 })
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
      const d = Math.hypot(dx, dy) || 1
      const k = Math.min(1, d / 300)
      x.set((dx / d) * range * k); y.set((dy / d) * range * k)
    }
    window.addEventListener('pointermove', on)
    return () => window.removeEventListener('pointermove', on)
  }, [ref, range, x, y])
  return { x, y }
}

/**
 * O mascote: um fantasminha líquido. A barra de baixo são gotas que pingam e se fundem (goo);
 * os olhos seguem o cursor; o humor mostra o estado do subagente.
 */
export function LiquidGhost({ mood = 'calm', size = 120, hue = 0, className }: { mood?: Mood; size?: number; hue?: 0 | 1 | 2; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const ref = useRef<SVGSVGElement>(null)
  const look = useLook(ref)
  const grads = [['#E9FEFF', '#7DF9FF', '#8B6CFF'], ['#F4EEFF', '#C7B2FF', '#7B5CFF'], ['#FFF0FA', '#FFB3E6', '#9B6CFF']][hue]
  const sad = mood === 'sad'
  return (
    <motion.svg ref={ref} viewBox="0 0 120 130" width={size} height={size * 130 / 120} className={className} aria-hidden
      animate={{ y: sad ? [0, 2, 0] : [0, -6, 0], rotate: mood === 'work' ? [-2, 2, -2] : 0 }}
      transition={{ repeat: Infinity, duration: sad ? 1.4 : 3, ease: 'easeInOut' }} style={{ overflow: 'visible' }}>
      <defs>
        <GooFilter id={`goo${uid}`} blur={5} sharp={20} />
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={sad ? '#dfe6f2' : grads[0]} />
          <stop offset=".5" stopColor={sad ? '#aab8d0' : grads[1]} />
          <stop offset="1" stopColor={sad ? '#7d86a8' : grads[2]} />
        </linearGradient>
        <radialGradient id={`s${uid}`} cx=".35" cy=".25" r=".5"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      {/* corpo + gotas, fundidos pelo goo */}
      <g filter={`url(#goo${uid})`} fill={`url(#g${uid})`}>
        <path d="M18 62 C18 30 36 12 60 12 C84 12 102 30 102 62 L102 96 L18 96 Z" />
        {[26, 46, 66, 86].map((cx, i) => (
          <motion.circle key={cx} cx={cx + 4} r={11} animate={{ cy: [98, 108 + (i % 2) * 6, 98] }}
            transition={{ repeat: Infinity, duration: 1.6 + i * 0.15, ease: 'easeInOut', delay: i * 0.2 }} />
        ))}
        <motion.circle cx={70} r={4.5} animate={{ cy: [104, 126], opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeIn', repeatDelay: 1.2 }} />
      </g>
      <ellipse cx="44" cy="36" rx="20" ry="13" fill={`url(#s${uid})`} />
      {/* rosto */}
      <motion.g style={{ x: look.x, y: look.y }}>
        {mood === 'happy' ? (
          <g stroke="#0A0C16" strokeWidth="5" strokeLinecap="round" fill="none"><path d="M38 58q6-8 12 0" /><path d="M70 58q6-8 12 0" /></g>
        ) : mood === 'sleep' ? (
          <g stroke="#0A0C16" strokeWidth="4.5" strokeLinecap="round"><path d="M38 58h12" /><path d="M70 58h12" /></g>
        ) : (
          <motion.g animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ repeat: Infinity, duration: 4, times: [0, 0.92, 0.95, 1] }} style={{ transformOrigin: '60px 56px' }}>
            <ellipse cx="44" cy={sad ? 60 : 56} rx="7" ry="9" fill="#0A0C16" /><ellipse cx="76" cy={sad ? 60 : 56} rx="7" ry="9" fill="#0A0C16" />
            <circle cx="46.5" cy={sad ? 56 : 52} r="2.6" fill="#fff" /><circle cx="78.5" cy={sad ? 56 : 52} r="2.6" fill="#fff" />
          </motion.g>
        )}
        {sad && <g stroke="#0A0C16" strokeWidth="4" strokeLinecap="round"><path d="M35 46l12 4" /><path d="M85 46l-12 4" /></g>}
        {mood === 'happy' && <path d="M52 70q8 8 16 0" stroke="#0A0C16" strokeWidth="4.5" fill="none" strokeLinecap="round" />}
        {mood === 'calm' && <path d="M55 72q5 3 10 0" stroke="#0A0C16" strokeWidth="4" fill="none" strokeLinecap="round" />}
        {mood === 'work' && <ellipse cx="60" cy="73" rx="4" ry="3.4" fill="#0A0C16" />}
        {sad && <path d="M52 76q8-7 16 0" stroke="#0A0C16" strokeWidth="4.5" fill="none" strokeLinecap="round" />}
        {(mood === 'happy' || mood === 'calm') && <g fill="#FF7DC0" opacity=".55"><ellipse cx="33" cy="68" rx="6" ry="3.5" /><ellipse cx="87" cy="68" rx="6" ry="3.5" /></g>}
      </motion.g>
      {sad && <motion.path d="M34 64q3 6 0 9q-3-3 0-9z" fill="#8fd8ff" animate={{ y: [0, 14], opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 1.3 }} />}
    </motion.svg>
  )
}
