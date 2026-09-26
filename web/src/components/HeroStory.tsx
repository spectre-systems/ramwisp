import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { PixelScene } from './PixelScene'

/** Primeira tela: a cena em pixel art conta problema → solução → fim, com legenda legível embaixo. */
const ACTS = [
  { k: 'falta', tab: 'O problema', ms: 5600,
    caption: <>Cada subagente que roda <b>testes, build ou navegador</b> come gigas da sua máquina. Com quatro em paralelo, os <b>16 GB</b> acabam: tudo trava e um fica <b>na fila</b>.</> },
  { k: 'wisp', tab: 'Com ramwisp', ms: 5600,
    caption: <>Cada subagente ganha uma <b>máquina própria na nuvem</b>, com a RAM que precisa. Todos rodam ao mesmo tempo e o seu computador fica livre.</> },
  { k: 'evapora', tab: 'Terminou', ms: 5000,
    caption: <>A resposta e as mudanças voltam para você. As máquinas <b>evaporam</b>: nada fica ligado, nada fica guardado.</> },
] as const

export function HeroStory() {
  const [act, setAct] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => setAct((a) => (a + 1) % ACTS.length), ACTS[act].ms)
    return () => clearTimeout(t)
  }, [act, auto])
  return (
    <div className="story px-box">
      <div className="story-tabs" role="tablist">
        {ACTS.map((a, i) => (
          <button key={a.k} role="tab" aria-selected={i === act} className={`px-tab ${i === act ? 'on' : ''}`} onClick={() => { setAct(i); setAuto(false) }}>
            <span className="n">{i + 1}</span>{a.tab}
            {i === act && auto && <motion.i key={act} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: a.ms / 1000, ease: (t) => Math.floor(t * 12) / 12 }} />}
          </button>
        ))}
      </div>
      <div className="scene-wrap"><PixelScene act={ACTS[act].k} /></div>
      <AnimatePresence mode="wait">
        <motion.p key={act} className="story-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: (t) => Math.round(t * 3) / 3 }}>
          {ACTS[act].caption}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
