import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Logo, Spinner, ThemeToggle } from '../components/ui'
import { useSession } from '../session'
import { AuthForm } from './Auth'

/** /ativar?code=XXXX-XXXX — onde o MCP manda a pessoa aprovar o login. */
export default function Activate() {
  const [params] = useSearchParams()
  const { me, loading } = useSession()
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase())
  const [info, setInfo] = useState<{ client_name: string; approved: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')

  useEffect(() => {
    if (!me || code.length < 9) return
    setErr('')
    api<{ client_name: string; approved: boolean }>('GET', `/api/device/${encodeURIComponent(code)}`)
      .then((r) => { setInfo(r); if (r.approved) setState('done') })
      .catch((e) => { setInfo(null); setErr(e instanceof ApiError ? e.message : 'error') })
  }, [me, code])

  const approve = async () => {
    setState('busy'); setErr('')
    try { await api('POST', '/api/device/approve', { user_code: code }); setState('done') } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'error'); setState('idle')
    }
  }

  return (
    <div className="auth-page px-page">

      <div style={{ position: 'fixed', top: 18, left: 22, right: 22, display: 'flex', justifyContent: 'space-between', zIndex: 3 }}><Logo /><ThemeToggle /></div>
      <motion.div className="card glow auth-card" layout initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
        <AnimatePresence mode="wait">
          {state === 'done' ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center' }}>
              <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 12 }}
                style={{ width: 72, height: 72, borderRadius: '50%', margin: '6px auto 18px', display: 'grid', placeItems: 'center', background: 'color-mix(in oklab, var(--ok) 16%, transparent)', border: '1px solid var(--ok)', boxShadow: '0 0 40px color-mix(in oklab, var(--ok) 40%, transparent)' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.6" strokeLinecap="round"><motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.5 }} /></svg>
              </motion.div>
              <h1>Connected!</h1>
              <p className="muted">You can go back to your terminal: your agent can now launch subagents on ramwisp.</p>
              <p className="faint" style={{ fontSize: 14 }}>Try asking: <em>“spin up a ramwisp subagent with 4 GB to …”</em></p>
              <Link className="btn" to="/painel" style={{ marginTop: 10 }}>Open the dashboard</Link>
            </motion.div>
          ) : !me ? (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="eyebrow">connect MCP</span>
              <h1>{authMode === 'signup' ? 'Create your account to continue' : 'Sign in to continue'}</h1>
              <p className="muted" style={{ margin: 0 }}>An MCP asked to use ramwisp on your behalf. After signing in, you confirm the code.</p>
              {code && <div className="device-code" style={{ marginTop: 18 }}>{code}</div>}
              {!loading && <AuthForm mode={authMode} onSwitch={setAuthMode} />}
              <div className="auth-switch muted">
                {authMode === 'signup'
                  ? <>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setAuthMode('login') }}>Sign in</a></>
                  : <>No account yet? <a href="#" onClick={(e) => { e.preventDefault(); setAuthMode('signup') }}>Create one with free credit</a></>}
              </div>
            </motion.div>
          ) : (
            <motion.div key="approve" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="eyebrow">connect MCP</span>
              <h1>Authorize this MCP?</h1>
              <p className="muted" style={{ margin: 0 }}>
                {info ? <>Request from <strong style={{ color: 'var(--text)' }}>{info.client_name}</strong>. </> : null}
                Check that the code below matches the one shown in your terminal.
              </p>
              <div style={{ margin: '20px 0 14px' }}>
                <input className="input device-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9} aria-label="Code" />
              </div>
              <p className="faint" style={{ fontSize: 13, margin: '0 0 16px' }}>
                It will be able to launch subagents using the credit of <strong>{me.email}</strong>. Revoke it any time in Dashboard → Tokens.
              </p>
              {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
              <button className="btn primary lg" style={{ width: '100%' }} disabled={state === 'busy' || !info} onClick={approve}>
                {state === 'busy' ? <Spinner /> : 'Authorize'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
