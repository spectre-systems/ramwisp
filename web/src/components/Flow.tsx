import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

/**
 * Diagrama animado do ciclo de um subagente: pedir → provar → selar → trabalhar → evaporar.
 * O ciclo roda sozinho; clicar num passo fixa nele.
 */
const STEPS = [
  { k: 'pedir', title: 'Pedir', text: 'Seu Claude chama spawn_agent. A gente liga uma máquina só sua, com a RAM que você pediu.' },
  { k: 'provar', title: 'Provar', text: 'A enclave mostra um documento assinado pelo hardware da AWS com o hash exato do código que está rodando. Seu MCP confere.' },
  { k: 'selar', title: 'Selar', text: 'Só então a missão e o seu login saem da sua máquina, cifrados para uma chave que existe apenas dentro daquela enclave.' },
  { k: 'trabalhar', title: 'Trabalhar', text: 'O agente roda isolado, só em memória. Nós vemos a RAM subir e descer — nunca o que ele faz.' },
  { k: 'evaporar', title: 'Evaporar', text: 'A resposta volta cifrada para você. A máquina é destruída e leva a memória junto.' },
]

export function Flow() {
  const [i, setI] = useState(0)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    if (pinned) return
    const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 3200)
    return () => clearInterval(t)
  }, [pinned])
  const step = STEPS[i].k

  return (
    <div className="flow">
      <div className="flow-stage card glow">
        <svg viewBox="0 0 640 300" width="100%" role="img" aria-label={`Passo ${i + 1}: ${STEPS[i].title}`}>
          <defs>
            <linearGradient id="fl-line" x1="0" x2="1">
              <stop offset="0" stopColor="var(--wisp)" /><stop offset="1" stopColor="var(--wisp-2)" />
            </linearGradient>
            <radialGradient id="fl-orb"><stop offset="0" stopColor="#fff" /><stop offset=".4" stopColor="var(--wisp)" /><stop offset="1" stopColor="var(--wisp)" stopOpacity="0" /></radialGradient>
            <filter id="fl-glow"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>

          {/* notebook */}
          <g transform="translate(40 96)">
            <rect x="0" y="0" width="150" height="96" rx="10" fill="var(--bg-3)" stroke="var(--line-2)" />
            <rect x="10" y="10" width="130" height="66" rx="5" fill="var(--bg)" stroke="var(--line)" />
            <path d="M-14 104h178l-10 10H-4z" fill="var(--bg-3)" stroke="var(--line-2)" />
            <text x="22" y="34" fill="var(--wisp)" fontFamily="var(--mono)" fontSize="10">› spawn_agent</text>
            <text x="22" y="50" fill="var(--muted)" fontFamily="var(--mono)" fontSize="9">ram_gb: 8</text>
            <motion.text x="22" y="66" fontFamily="var(--mono)" fontSize="9" animate={{ opacity: step === 'provar' ? 1 : 0.0 }} fill="var(--ok)">✓ PCR0 confere</motion.text>
            <text x="75" y="140" textAnchor="middle" fill="var(--muted)" fontSize="12" fontFamily="var(--sans)">seu computador</text>
          </g>

          {/* trilho */}
          <path id="fl-path" d="M200 150 C 280 150, 330 150, 420 150" stroke="var(--line-2)" strokeDasharray="4 6" fill="none" />
          <motion.path d="M200 150 C 280 150, 330 150, 420 150" stroke="url(#fl-line)" strokeWidth="2" fill="none"
            initial={{ pathLength: 0 }} animate={{ pathLength: step === 'evaporar' ? 0 : 1, opacity: step === 'evaporar' ? 0.2 : 1 }} transition={{ duration: 1.1 }} />

          {/* pacote viajando */}
          <AnimatePresence mode="wait">
            {(step === 'provar' || step === 'selar' || step === 'evaporar') && (
              <motion.g key={step}
                initial={{ x: step === 'selar' ? 205 : 410, opacity: 0 }}
                animate={{ x: step === 'selar' ? 410 : 205, opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.3 }}>
                <circle cx="0" cy="150" r="14" fill="url(#fl-orb)" filter="url(#fl-glow)" />
                {step === 'selar'
                  ? <path d="M-6 147h12v9h-12z M-4 147v-3a4 4 0 0 1 8 0v3" stroke="#041015" strokeWidth="1.8" fill="var(--wisp)" />
                  : step === 'provar'
                    ? <path d="M-6 150l4 4 8-8" stroke="#041015" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                    : <circle cx="0" cy="150" r="4" fill="#041015" />}
              </motion.g>
            )}
          </AnimatePresence>

          {/* máquina na nuvem com a enclave */}
          <g transform="translate(430 60)">
            <motion.rect x="0" y="0" width="180" height="180" rx="16" fill="var(--bg-2)" stroke="var(--line-2)"
              animate={{ opacity: step === 'evaporar' ? 0.25 : 1, scale: step === 'pedir' ? [0.9, 1] : 1 }} style={{ transformOrigin: '90px 90px' }} transition={{ duration: 0.8 }} />
            <text x="14" y="22" fill="var(--faint)" fontSize="10" fontFamily="var(--mono)">EC2 efêmera</text>
            <motion.rect x="26" y="40" width="128" height="112" rx="12" fill="none" strokeWidth="1.5"
              stroke="url(#fl-line)" animate={{ opacity: step === 'evaporar' ? 0 : 1, strokeDasharray: step === 'pedir' ? '6 6' : '0 0' }} />
            <text x="40" y="60" fill="var(--wisp)" fontSize="10" fontFamily="var(--mono)">enclave Nitro</text>
            {/* RAM subindo */}
            {[0, 1, 2, 3, 4, 5].map((b) => (
              <motion.rect key={b} x={44 + b * 17} y={92} width="11" height={50} rx="2" fill="url(#fl-line)"
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                animate={{ scaleY: step === 'trabalhar' ? [0.15, 0.4 + ((b * 13) % 50) / 100, 0.25 + ((b * 7) % 40) / 100, 0.9] : step === 'evaporar' ? 0 : 0.12 }}
                transition={{ duration: 2.4, repeat: step === 'trabalhar' ? Infinity : 0, repeatType: 'mirror', delay: b * 0.08 }} />
            ))}
            <motion.g animate={{ opacity: step === 'selar' || step === 'trabalhar' ? 1 : 0 }}>
              <path d="M84 76h12v9H84z M86 76v-3a4 4 0 0 1 8 0v3" stroke="var(--wisp)" strokeWidth="1.6" fill="none" />
            </motion.g>
            {/* partículas evaporando */}
            {step === 'evaporar' && [0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
              <motion.circle key={p} r="3" fill="var(--wisp)" initial={{ cx: 60 + p * 9, cy: 110, opacity: 0.9 }}
                animate={{ cy: -20 - p * 6, cx: 50 + p * 12 + (p % 2 ? 14 : -14), opacity: 0 }} transition={{ duration: 2.2, delay: p * 0.09, repeat: Infinity }} />
            ))}
            <text x="90" y="206" textAnchor="middle" fill="var(--muted)" fontSize="12" fontFamily="var(--sans)">nuvem wisp · AWS</text>
          </g>
        </svg>
      </div>

      <ol className="flow-steps">
        {STEPS.map((s, idx) => (
          <li key={s.k}>
            <button className={idx === i ? 'on' : ''} onClick={() => { setI(idx); setPinned(true) }}>
              <span className="n mono">{String(idx + 1).padStart(2, '0')}</span>
              <span>
                <strong>{s.title}</strong>
                <AnimatePresence initial={false}>
                  {idx === i && (
                    <motion.span className="d muted" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      {s.text}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              {idx === i && !pinned && <motion.span key={i} className="bar" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 3.2, ease: 'linear' }} />}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
