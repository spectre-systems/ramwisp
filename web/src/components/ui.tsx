import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from './Ghost'

export function Logo({ size = 22 }: { size?: number }) {
  return <Link to="/" className="logo" aria-label="ramwisp, home"><Wordmark size={size} /></Link>
}

export function CopyCommand({ cmd, prompt = '$' }: { cmd: string; prompt?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(cmd) } catch {
      const t = document.createElement('textarea'); t.value = cmd; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }
  return (
    <div className="cmd">
      {prompt && <span className="prompt">{prompt}</span>}
      <code>{cmd}</code>
      <button className="btn sm" onClick={copy} aria-label="Copy command" style={{ minWidth: 86 }}>
        <motion.span key={String(copied)} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          {copied ? '✓ copied' : 'copy'}
        </motion.span>
      </button>
    </div>
  )
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | undefined>(() => document.documentElement.dataset.theme)
  const isDark = theme ? theme === 'dark' : !window.matchMedia('(prefers-color-scheme: light)').matches
  const flip = () => {
    const next = isDark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('wisp-theme', next) } catch { /* sem storage */ }
    setTheme(next)
  }
  return (
    <button className="btn ghost theme-toggle" onClick={flip} aria-label={isDark ? 'Light theme' : 'Dark theme'} title={isDark ? 'Light theme' : 'Dark theme'}>
      <motion.svg key={String(isDark)} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {isDark
          ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          : <><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      </motion.svg>
    </button>
  )
}

/** Número que conta até o valor quando entra na tela (ou quando muda). */
export function CountUp({ value, format = (n: number) => n.toFixed(0) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const mv = useMotionValue(0)
  const text = useTransform(mv, format)
  const inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView) return
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] })
    return () => c.stop()
  }, [value, inView, mv])
  return <motion.span ref={ref}>{text}</motion.span>
}

export function Reveal({ children, delay = 0, y = 24 }: { children: ReactNode; delay?: number; y?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

/** Barra de RAM: usado (animado) sobre o teto. */
export function RamBar({ used, total, height = 8 }: { used: number; total: number; height?: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const hot = pct > 85
  return (
    <div style={{ height, borderRadius: 99, background: 'var(--line)', overflow: 'hidden', position: 'relative' }} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 60, damping: 18 }}
        style={{ height: '100%', borderRadius: 99, background: hot ? 'linear-gradient(90deg, var(--warn), var(--err))' : 'linear-gradient(90deg, var(--wisp), var(--wisp-2))',
          boxShadow: `0 0 12px ${hot ? 'var(--err)' : 'var(--wisp)'}` }} />
    </div>
  )
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = { done: 'ok', failed: 'err', expired: 'warn', killed: '' }
  const live = ['launching', 'booting', 'fetching_image', 'enclave_starting', 'awaiting_input', 'running'].includes(status)
  const labels: Record<string, string> = {
    queued: 'queued', launching: 'requesting machine', booting: 'booting', fetching_image: 'loading image',
    enclave_starting: 'starting enclave', awaiting_input: 'attested · sealing', running: 'working',
    done: 'done', failed: 'failed', killed: 'killed', expired: 'expired',
  }
  return <span className={`pill ${live ? 'live' : map[status] ?? ''}`}><span className="dot" />{labels[status] ?? status}</span>
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 24 24" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} aria-label="loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </motion.svg>
  )
}
