import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Ghost } from './Ghost'

/**
 * A história do produto em 3 atos, na primeira tela:
 *  1. falta RAM: subagentes se espremendo nos 16 GB do seu computador, um na fila, medidor no vermelho;
 *  2. wisp: cada um sobe para uma máquina própria com a RAM que precisa; o seu computador respira;
 *  3. evapora: a resposta volta e a máquina some, levando a chave junto.
 * Cada fantasminha usa o mesmo layoutId nos três atos, então ele "voa" de um lugar para o outro.
 */
const ACTS = [
  { k: 'falta', tab: 'O problema', ms: 5200,
    caption: <>Cada subagente que roda <b>testes, build ou navegador</b> come gigas da sua máquina. Com quatro em paralelo, os <b>16 GB</b> acabam: tudo trava e um fica <b>na fila</b>.</> },
  { k: 'wisp', tab: 'Com wisp', ms: 5200,
    caption: <>Cada subagente ganha uma <b>máquina própria na nuvem</b>, com a RAM que precisa. Todos rodam ao mesmo tempo e o seu computador fica livre.</> },
  { k: 'evapora', tab: 'Terminou', ms: 4600,
    caption: <>A resposta e as mudanças voltam para você. As máquinas <b>evaporam</b>: nada fica ligado, nada fica guardado.</> },
] as const

const GHOSTS = [0, 1, 2, 3]
const spring = { type: 'spring', stiffness: 90, damping: 16 } as const

export function HeroStory() {
  const [act, setAct] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => setAct((a) => (a + 1) % ACTS.length), ACTS[act].ms)
    return () => clearTimeout(t)
  }, [act, auto])
  const k = ACTS[act].k
  const ram = k === 'falta' ? 97 : 31

  return (
    <div className="story card glow">
      <div className="story-tabs" role="tablist">
        {ACTS.map((a, i) => (
          <button key={a.k} role="tab" aria-selected={i === act} className={i === act ? 'on' : ''} onClick={() => { setAct(i); setAuto(false) }}>
            <span className="mono">{i + 1}</span>{a.tab}
            {i === act && auto && <motion.i key={act} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: a.ms / 1000, ease: 'linear' }} />}
          </button>
        ))}
      </div>

      <LayoutGroup>
        <div className="story-stage">
          {/* nuvem: uma máquina por subagente */}
          <div className="story-cloud">
            {GHOSTS.map((g) => (
              <motion.div key={g} className="vm"
                animate={{ opacity: k === 'falta' ? 0.35 : k === 'evapora' ? 0 : 1, y: k === 'evapora' ? -18 : 0, filter: k === 'evapora' ? 'blur(6px)' : 'blur(0px)' }}
                transition={{ duration: k === 'evapora' ? 1.4 : 0.6, delay: k === 'evapora' ? 0.9 + g * 0.12 : g * 0.08 }}>
                <span className="vm-label mono">{k === 'falta' ? 'nuvem · livre' : `máquina ${g + 1} · 8 GB`}</span>
                <div className="vm-slot">
                  {k !== 'falta' && (
                    <motion.div layoutId={`g${g}`} transition={spring}
                      animate={k === 'evapora' ? { opacity: 0, y: -30, scale: 0.6 } : { opacity: 1, y: 0, scale: 1 }}
                      style={{ transitionDelay: '0s' }}>
                      <Ghost mood={k === 'evapora' ? 'happy' : g % 2 ? 'work' : 'happy'} size={42} hue={(g % 3) as 0 | 1 | 2} />
                    </motion.div>
                  )}
                </div>
                <div className="vm-bar"><motion.span animate={{ width: k === 'wisp' ? `${38 + g * 11}%` : '0%' }} transition={{ duration: 1.2, delay: 0.5 + g * 0.1 }} /></div>
                {k === 'evapora' && (
                  <motion.span className="vm-result mono" initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 1, 0], y: [0, 0, 90, 150] }}
                    transition={{ duration: 1.6, delay: g * 0.12, times: [0, 0.15, 0.7, 1] }}>✓ resposta</motion.span>
                )}
              </motion.div>
            ))}
          </div>

          {/* seu computador */}
          <div className={`laptop2 ${k === 'falta' ? 'hot' : ''}`}>
            <div className="laptop2-head">
              <span className="mono">seu computador · 16 GB</span>
              <span className="mono ram-num">RAM <motion.b key={ram} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{ram}%</motion.b></span>
            </div>
            <div className="ram-meter"><motion.span animate={{ width: `${ram}%` }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} /></div>
            <div className="laptop2-body">
              <div className="you-block">editor + navegador</div>
              <div className="cram">
                {k === 'falta' && <span className="cram-tag mono">testes · build · navegador</span>}
                {k === 'falta' && GHOSTS.slice(0, 3).map((g, i) => (
                  <motion.div key={g} layoutId={`g${g}`} transition={spring} className="crammed"
                    initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0, scaleX: 1.12, scaleY: 0.8 }}
                    style={{ transformOrigin: 'bottom', marginLeft: i ? -14 : 0 }}>
                    <Ghost mood="sad" size={50} hue={(g % 3) as 0 | 1 | 2} />
                  </motion.div>
                ))}
              </div>
              {k === 'evapora' && (
                <motion.ul className="done-list" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.35, delayChildren: 1.1 } } }}>
                  {['4 respostas recebidas', 'máquinas destruídas', 'nada ficou para trás'].map((t) => (
                    <motion.li key={t} variants={{ h: { opacity: 0, x: -8 }, s: { opacity: 1, x: 0 } }}>✓ {t}</motion.li>
                  ))}
                </motion.ul>
              )}
            </div>
            <AnimatePresence>
              {k === 'falta' && (
                <motion.div className="queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.div layoutId="g3" transition={spring}><Ghost mood="sad" size={40} hue={0} /></motion.div>
                  <span className="mono">na fila…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.p key={k} className="story-caption" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
          {ACTS[act].caption}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
