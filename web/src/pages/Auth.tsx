import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { LiquidBg } from '../components/LiquidBg'
import { Logo, Spinner, ThemeToggle } from '../components/ui'
import { useSession } from '../session'

/** Formulário de entrar/criar conta. `onDone` recebe o controle depois (padrão: ir para o painel ou ?next). */
export function AuthForm({ mode, onDone, onSwitch }: { mode: 'login' | 'signup'; onDone?: (gift?: number) => void; onSwitch?: (m: 'login' | 'signup') => void }) {
  const { refresh } = useSession()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const r = await api<{ gift_cents?: number }>('POST', mode === 'login' ? '/api/auth/login' : '/api/auth/signup', { email, password: pw, name })
      await refresh()
      onDone?.(r.gift_cents)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // já tem conta: tenta entrar com o que foi digitado antes de mandar a pessoa para outra tela
        try { await api('POST', '/api/auth/login', { email, password: pw }); await refresh(); onDone?.(); return } catch { /* senha diferente */ }
        onSwitch?.('login')
        setErr('Esse email já tem conta, mas a senha não confere.')
      } else setErr(e instanceof ApiError ? e.message : 'não consegui falar com o servidor')
    } finally { setBusy(false) }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === 'signup' && (
        <div className="field"><label htmlFor="n">Nome</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Como te chamamos" /></div>
      )}
      <div className="field"><label htmlFor="e">Email</label><input id="e" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="voce@empresa.com" /></div>
      <div className="field"><label htmlFor="p">Senha</label><input id="p" className="input" type="password" required minLength={mode === 'signup' ? 8 : 1} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'pelo menos 8 caracteres' : ''} /></div>
      <AnimatePresence>{err && <motion.div className="error-box" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{err}</motion.div>}</AnimatePresence>
      <button className="btn primary lg" disabled={busy}>{busy ? <Spinner /> : mode === 'login' ? 'Entrar' : 'Criar conta com crédito grátis'}</button>
    </form>
  )
}

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { me } = useSession()
  const next = params.get('next') || '/painel'
  useEffect(() => { if (me) nav(next, { replace: true }) }, [me, nav, next])
  const q = params.toString() ? `?${params}` : ''
  return (
    <div className="auth-page px-page">
      <LiquidBg />
      <div style={{ position: 'fixed', top: 18, left: 22, right: 22, display: 'flex', justifyContent: 'space-between', zIndex: 3 }}><Logo /><ThemeToggle /></div>
      <motion.div className="card glow auth-card" initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
        <span className="eyebrow">{mode === 'login' ? 'bem-vindo de volta' : 'crédito grátis para começar'}</span>
        <h1>{mode === 'login' ? 'Entrar no ramwisp' : 'Criar sua conta'}</h1>
        <p className="muted" style={{ margin: 0 }}>{mode === 'login' ? 'Acompanhe seus subagentes, uso e tokens.' : 'Sem cartão. Seus subagentes começam a rodar em minutos.'}</p>
        <AuthForm mode={mode} onDone={(gift) => nav(next + (gift ? (next.includes('?') ? '&' : '?') + 'boas-vindas=1' : ''), { replace: true })} />
        <div className="auth-switch muted">
          {mode === 'login' ? <>Não tem conta? <Link to={`/criar-conta${q}`}>Criar agora</Link></> : <>Já tem conta? <Link to={`/entrar${q}`}>Entrar</Link></>}
        </div>
      </motion.div>
    </div>
  )
}
