import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ACTIVE, ago, api, ApiError, codexToml, dur, engineLabel, installCmd, usd, viaLabel,
  type Day, type Ev, type Job, type Ledger, type Token,
} from '../api'
import { CopyCommand, CountUp, Logo, RamBar, Spinner, StatusPill, ThemeToggle } from '../components/ui'
import { useSession } from '../session'
import { Ghost } from '../components/Ghost'

function usePoll<T>(path: string, ms = 4000) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try { setData(await api<T>('GET', path)); setErr('') } catch (e) { setErr(e instanceof ApiError ? e.message : 'erro') }
  }, [path])
  useEffect(() => {
    load()
    if (!ms) return
    const t = setInterval(() => { if (!document.hidden) load() }, ms)
    return () => clearInterval(t)
  }, [load, ms])
  return { data, err, reload: load }
}

const I = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  agents: <><circle cx="12" cy="9" r="5" /><path d="M8 14c-1 3-3 5-4 6M16 14c1 3 3 5 4 6M12 14v7" /></>,
  plug: <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></>,
  receipt: <path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" />,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  shield: <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />,
}
const Icon = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>

export default function Dashboard() {
  const { me, loading, logout } = useSession()
  const nav = useNavigate()
  const loc = useLocation()
  if (loading) return <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}><Spinner size={24} /></div>
  if (!me) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname)}`} replace />
  const links: [string, string, React.ReactNode][] = [
    ['/painel', 'Overview', I.home], ['/painel/agentes', 'Subagents', I.agents], ['/painel/conectar', 'Connect', I.plug],
    ['/painel/tokens', 'Tokens', I.key], ['/painel/extrato', 'Billing', I.receipt], ['/painel/atividade', 'Activity', I.pulse],
  ]
  return (
    <div className="dash">
      <aside className="side">
        <Logo />
        <nav>
          {links.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/painel'}>
              {({ isActive }) => <>
                {isActive && <motion.span layoutId="side-active" className="active-bg" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                <Icon d={icon} />{label}
              </>}
            </NavLink>
          ))}
          <NavLink to="/transparencia"><Icon d={I.shield} />Transparency</NavLink>
        </nav>
        <div className="credit-mini">
          <div className="faint" style={{ fontSize: 12 }}>Balance</div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{usd(me.credit_cents)}</div>
        </div>
        <div className="side-foot">
          <span className="faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.email}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <ThemeToggle />
            <button className="btn ghost sm" onClick={async () => { await logout(); nav('/') }}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <Routes location={loc}>
              <Route index element={<Overview />} />
              <Route path="agentes" element={<Agents />} />
              <Route path="conectar" element={<Connect />} />
              <Route path="tokens" element={<Tokens />} />
              <Route path="extrato" element={<Statement />} />
              <Route path="atividade" element={<Activity />} />
              <Route path="*" element={<Navigate to="/painel" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------- visão geral

function Overview() {
  const { me, refresh } = useSession()
  const [params, setParams] = useSearchParams()
  const jobs = usePoll<Job[]>('/api/jobs?limit=100', 3000)
  const days = usePoll<Day[]>('/api/usage/daily', 30000)
  const tokens = usePoll<Token[]>('/api/tokens', 0)
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) refresh() }, 6000); return () => clearInterval(t) }, [refresh])
  const live = (jobs.data ?? []).filter((j) => ACTIVE.includes(j.status) || j.status === 'queued')
  const month = (days.data ?? []).reduce((a, d) => ({ jobs: a.jobs + d.jobs, cost: a.cost + d.cost_cents, gbh: a.gbh + d.gb_hours }), { jobs: 0, cost: 0, gbh: 0 })
  const hasToken = (tokens.data ?? []).some((t) => !t.revoked_at)
  const hasJob = (jobs.data ?? []).length > 0
  const welcome = params.get('boas-vindas')

  return (
    <>
      <AnimatePresence>
        {welcome && (
          <motion.div className="card glow" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><strong>Welcome to ramwisp{me?.name ? `, ${me.name}` : ''}!</strong> <span className="muted">You got {usd(me?.credit_cents)} of credit to try it out.</span></div>
            <button className="btn sm" onClick={() => setParams({})}>Close</button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="page-h">
        <div><span className="eyebrow">dashboard</span><h1>Hi{me?.name ? `, ${me.name}` : ''}</h1></div>
        <Link className="btn" to="/painel/conectar">Connect an agent</Link>
      </div>

      <div className="kpis">
        <div className="card kpi glow"><div className="l">Balance</div><div className="v"><CountUp value={(me?.credit_cents ?? 0) / 100} format={(n) => `$${n.toFixed(2)}`} /></div></div>
        <div className="card kpi"><div className="l">Active subagents</div><div className="v"><CountUp value={live.length} /></div></div>
        <div className="card kpi"><div className="l">Subagents (30 days)</div><div className="v"><CountUp value={month.jobs} /></div></div>
        <div className="card kpi"><div className="l">GB·hours (30 days)</div><div className="v"><CountUp value={month.gbh} format={(n) => n.toFixed(1)} /></div></div>
      </div>

      {(!hasToken || !hasJob) && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3 style={{ margin: '0 0 8px' }}>Getting started</h3>
          <div className="onboard">
            <OnboardStep done t="Create an account" d="Done. Your free credit is already in your balance." />
            <OnboardStep done={hasToken} t="Add the MCP to Claude Code or Codex" d="Run the command below; on first use it opens this site so you can approve it.">
              {!hasToken && <div style={{ marginTop: 10 }}><CopyCommand cmd={installCmd()} /></div>}
            </OnboardStep>
            <OnboardStep done={hasJob} t="Ask for your first subagent" d={'Tell your agent: "spin up a ramwisp subagent with 4 GB to …"'} />
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 18, margin: '34px 0 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        Ao vivo {live.length > 0 && <span className="pill live"><span className="dot" />{live.length}</span>}
      </h2>
      {live.length === 0
        ? <div className="card empty"><Ghost mood="sleep" size={52} /><p className="muted" style={{ margin: '10px 0 0' }}>No subagents running right now.</p></div>
        : <div className="live-grid"><AnimatePresence>{live.map((j) => <LiveCard key={j.id} j={j} />)}</AnimatePresence></div>}

      <h2 style={{ fontSize: 18, margin: '34px 0 14px' }}>Usage over the last 30 days</h2>
      <div className="card"><UsageChart days={days.data ?? []} /></div>
    </>
  )
}

function OnboardStep({ done, t, d, children }: { done?: boolean; t: string; d: string; children?: React.ReactNode }) {
  return (
    <div className="onboard-step">
      <span className={`check ${done ? 'done' : ''}`}>{done ? '✓' : ''}</span>
      <div><strong style={{ fontWeight: 550 }}>{t}</strong><div className="muted" style={{ fontSize: 14 }}>{d}</div>{children}</div>
    </div>
  )
}

const PHASES = ['queued', 'launching', 'booting', 'fetching_image', 'enclave_starting', 'awaiting_input', 'running']

function LiveCard({ j }: { j: Job }) {
  const idx = PHASES.indexOf(j.status)
  const total = j.mem_total_mib ?? j.enclave_mem_mib
  const since = j.started_at ?? j.launched_at ?? j.created_at
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  const kill = async () => { if (confirm(`Kill ${j.id}? The machine is destroyed immediately.`)) await api('DELETE', `/api/jobs/${j.id}`).catch(() => {}) }
  return (
    <motion.div className="card agent-card glow" layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, filter: 'blur(8px)' }}>
      <div className="top">
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ghost mood={j.status === 'running' ? 'work' : 'sleep'} size={32} hue={(j.id.charCodeAt(4) % 3) as 0 | 1 | 2} />
          <span className="mono" style={{ fontSize: 13 }}>{j.id}</span>
        </span>
        <StatusPill status={j.status} />
      </div>
      {j.label && <div className="muted" style={{ fontSize: 14, marginTop: -4 }}>{j.label}</div>}
      <div className="phases" aria-label="fases">{PHASES.map((p, i) => <span key={p} className={i <= idx ? 'on' : ''} />)}</div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span className="muted">RAM</span>
          <span className="mono">{j.mem_used_mib != null ? `${(j.mem_used_mib / 1024).toFixed(1)} / ${((total ?? 0) / 1024).toFixed(0)} GB` : `${j.ram_gb} GB reserved`}</span>
        </div>
        <RamBar used={j.mem_used_mib ?? 0} total={total ?? 1} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        <span className="faint">{viaLabel(j.client)} → {engineLabel(j.engine)} · {dur((Date.now() - since) / 1000)}</span>
        <button className="btn sm danger" onClick={kill}>Kill</button>
      </div>
    </motion.div>
  )
}

function UsageChart({ days }: { days: Day[] }) {
  const series = useMemo(() => {
    const map = new Map(days.map((d) => [d.day, d]))
    return Array.from({ length: 30 }, (_, i) => {
      const dt = new Date(Date.now() - (29 - i) * 86400_000)
      const key = dt.toISOString().slice(0, 10)
      return { key, label: dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }), d: map.get(key) }
    })
  }, [days])
  const max = Math.max(0.01, ...series.map((s) => s.d?.gb_hours ?? 0))
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const W = 900, H = 180, bw = W / 30
  if (!days.length) return <p className="muted" style={{ margin: 0, textAlign: 'center', padding: '30px 0' }}>Once you run subagents, usage shows up here.</p>
  return (
    <div ref={box} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label="GB·hours per day">
        <defs><linearGradient id="bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--wisp)" /><stop offset="1" stopColor="var(--wisp-2)" stopOpacity=".5" /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={H - H * f} y2={H - H * f} stroke="var(--line)" />)}
        {series.map((s, i) => {
          const v = s.d?.gb_hours ?? 0
          const h = Math.max(v > 0 ? 3 : 0, (v / max) * (H - 10))
          return (
            <g key={s.key} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <motion.rect x={i * bw + bw * 0.18} width={bw * 0.64} rx="3" fill="url(#bar)" opacity={hover === null || hover === i ? 1 : 0.45}
                initial={{ y: H, height: 0 }} animate={{ y: H - h, height: h }} transition={{ duration: 0.8, delay: i * 0.015, ease: [0.16, 1, 0.3, 1] }} />
              {i % 5 === 2 && <text x={i * bw + bw / 2} y={H + 18} textAnchor="middle" fontSize="11" fill="var(--faint)">{s.label}</text>}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((hover + 0.5) / 30) * 100}%`, top: 40 }}>
          <strong>{series[hover].label}</strong><br />
          {(series[hover].d?.gb_hours ?? 0).toFixed(2)} GB·h · {series[hover].d?.jobs ?? 0} subagentes · {usd(series[hover].d?.cost_cents ?? 0, 3)}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- subagentes

function Agents() {
  const jobs = usePoll<Job[]>('/api/jobs?limit=200', 4000)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">history</span><h1>Subagents</h1></div></div>
      <div className="card" style={{ padding: 10 }}>
        {!jobs.data ? <div className="empty"><Spinner /></div> : jobs.data.length === 0 ? (
          <div className="empty"><div className="ghost-wisp">◌</div><p className="muted">No subagents yet. <Link to="/painel/conectar" style={{ color: 'var(--wisp)' }}>Connect your agent</Link>.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ID</th><th>Status</th><th>Requested by</th><th>Engine</th><th>RAM</th><th>Peak</th><th>Duration</th><th>Cost</th><th>When</th></tr></thead>
              <tbody>
                {jobs.data.map((j) => (
                  <Fragment key={j.id}>
                    <tr className="clickable" onClick={() => setOpen(open === j.id ? null : j.id)}>
                      <td className="mono">{j.id}{j.label && <div className="faint" style={{ fontFamily: 'var(--sans)', fontSize: 12 }}>{j.label}</div>}</td>
                      <td><StatusPill status={j.status} /></td>
                      <td>{viaLabel(j.client)}</td>
                      <td>{engineLabel(j.engine)}</td>
                      <td className="mono">{j.ram_gb} GB</td>
                      <td className="mono">{j.peak_mem_mib ? `${(j.peak_mem_mib / 1024).toFixed(1)} GB` : '—'}</td>
                      <td className="mono">{j.finished_at && j.launched_at ? dur((j.finished_at - j.launched_at) / 1000) : ACTIVE.includes(j.status) ? '…' : '—'}</td>
                      <td className="mono">{j.cost_cents != null ? usd(j.cost_cents, 3) : '—'}</td>
                      <td className="faint">{ago(j.created_at)}</td>
                    </tr>
                    <AnimatePresence>
                      {open === j.id && (
                        <tr><td colSpan={9} style={{ padding: 0, borderTop: 0 }}>
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                            <JobDetail j={j} />
                          </motion.div>
                        </td></tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function JobDetail({ j }: { j: Job }) {
  const log = usePoll<Ev[]>(`/api/jobs/${j.id}/events`, ACTIVE.includes(j.status) ? 3000 : 0)
  const egress = Object.entries(j.egress ?? {}).sort((a, b) => b[1] - a[1])
  const rows = (log.data ?? []).slice().sort((a, b) => a.at - b.at)
  const t0 = rows[0]?.at ?? j.created_at
  return (
    <div style={{ padding: '6px 14px 18px' }}>
      <div className="detail-grid">
        <div><div className="l">Requested by</div>{viaLabel(j.client)}</div>
        <div><div className="l">Engine</div>{engineLabel(j.engine)}</div>
        <div><div className="l">Machine</div>{j.instance_type} · {j.enclave_cpus} vCPU</div>
        <div><div className="l">Enclave memory</div>{(j.enclave_mem_mib / 1024).toFixed(0)} GB</div>
        <div><div className="l">Exit code</div>{j.exit_code ?? '—'}</div>
        <div><div className="l">Result</div>{j.collected_at ? 'collected and deleted' : j.status === 'done' ? 'waiting for your MCP' : '—'}</div>
      </div>
      {j.error && <div className="error-box" style={{ marginBottom: 12 }}>{j.error}</div>}
      <div className="faint" style={{ fontSize: 12, margin: '4px 0 6px', letterSpacing: '.05em' }}>SUBAGENT LOG</div>
      <div className="joblog mono">
        {rows.length === 0 && <div className="faint">loading…</div>}
        {rows.map((e, i) => (
          <div key={i} className="joblog-row">
            <span className="faint">{new Date(e.at).toLocaleTimeString('en-US', { hour12: false })}</span>
            <span className="faint">+{Math.round((e.at - t0) / 1000)}s</span>
            <span>{EVENT_LABEL[e.kind] ?? e.kind}</span>
            <span className="faint">{detail(e)}</span>
          </div>
        ))}
      </div>
      {egress.length > 0 && (
        <>
          <div className="faint" style={{ fontSize: 12, margin: '14px 0 6px' }}>Domains reached (name and volume only; the content is encrypted)</div>
          <div className="egress">{egress.map(([h, b]) => <span key={h} className="pill mono">{h} · {(b / 1024).toFixed(0)} KB</span>)}</div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- conectar

function Connect() {
  const [tab, setTab] = useState<'claude' | 'codex'>('claude')
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">onboarding</span><h1>Connect an agent</h1></div></div>
      <div className="card glow">
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {(['claude', 'codex'] as const).map((k) => (
            <button key={k} className={`btn sm ${tab === k ? '' : 'ghost'}`} onClick={() => setTab(k)} style={{ position: 'relative' }}>
              {k === 'claude' ? 'Claude Code' : 'Codex'}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            {tab === 'claude' ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>Rode no terminal. Vale para todos os seus projetos.</p>
                <CopyCommand cmd={installCmd()} />
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>Add this to <code>~/.codex/config.toml</code> and restart Codex. <code>tool_timeout_sec</code> matters: waiting for a subagent can take minutes.</p>
                <pre className="block mono">{codexToml()}</pre>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <ol className="muted" style={{ margin: '20px 0 0', paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14 }}>
          <li>On first use, the MCP opens this site for you to approve (or prints a link, if you are on a server).</li>
          <li>By default it uses the Claude Code/Codex login on that machine. To use an API key instead, set <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code> in the MCP env.</li>
          <li>Ask your agent in plain words: <em>“run this in a ramwisp subagent with 8 GB”</em>.</li>
        </ol>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Prefer a fixed token?</h3>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>For CI or machines without a browser: create a token in <Link to="/painel/tokens" style={{ color: 'var(--wisp)' }}>Tokens</Link> and pass it as <code>WISP_TOKEN</code>.</p>
        <CopyCommand cmd={'claude mcp add --scope user ramwisp -e WISP_TOKEN=wsp_… -- npx -y ramwisp@latest'} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------- tokens

function Tokens() {
  const tokens = usePoll<Token[]>('/api/tokens', 0)
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try { const r = await api<{ token: string }>('POST', '/api/tokens', { label: label || 'manual token' }); setFresh(r.token); setLabel(''); tokens.reload() } finally { setBusy(false) }
  }
  const revoke = async (id: string) => { if (confirm('Revoke this token? Any MCP using it stops working.')) { await api('DELETE', `/api/tokens/${id}`); tokens.reload() } }
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">access</span><h1>Tokens</h1></div></div>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="tl">Token name</label><input id="tl" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. CI for project X" /></div>
        <button className="btn primary" onClick={create} disabled={busy}>{busy ? <Spinner /> : 'Create token'}</button>
      </div>
      <AnimatePresence>
        {fresh && (
          <motion.div className="card new-token" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 14 }}>
            <strong>Copy it now — it won’t be shown again.</strong>
            <div style={{ marginTop: 10 }}><CopyCommand cmd={fresh} prompt="" /></div>
            <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setFresh(null)}>I copied it</button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="card" style={{ marginTop: 14, padding: 10 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {(tokens.data ?? []).map((t) => (
                <tr key={t.id} style={{ opacity: t.revoked_at ? 0.45 : 1 }}>
                  <td>{t.label}</td>
                  <td className="mono">{t.prefix}…</td>
                  <td className="faint">{ago(t.created_at)}</td>
                  <td className="faint">{t.last_used_at ? ago(t.last_used_at) : 'never'}</td>
                  <td style={{ textAlign: 'right' }}>{t.revoked_at ? <span className="pill">revoked</span> : <button className="btn sm danger" onClick={() => revoke(t.id)}>Revoke</button>}</td>
                </tr>
              ))}
              {tokens.data?.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>No tokens. Signing in through the MCP creates one automatically.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- extrato e atividade

function Statement() {
  const rows = usePoll<Ledger[]>('/api/ledger', 10000)
  const { me } = useSession()
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">credit</span><h1>Billing</h1></div><div className="card" style={{ padding: '10px 18px' }}>Balance <strong>{usd(me?.credit_cents)}</strong></div></div>
      <p className="muted" style={{ marginTop: -10 }}>Each subagent reserves the most it can cost and refunds the rest when it finishes. Billed per second, 60 s minimum.</p>
      <div className="card" style={{ padding: 10 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Description</th><th>Subagent</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {(rows.data ?? []).map((r, i) => (
                <tr key={i}>
                  <td className="faint">{new Date(r.at).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                  <td>{reasonLabel(r.reason)}</td>
                  <td className="mono faint">{r.job_id ?? ''}</td>
                  <td className="mono" style={{ textAlign: 'right', color: r.cents >= 0 ? 'var(--ok)' : 'var(--text)' }}>{r.cents >= 0 ? '+' : '−'}{usd(Math.abs(r.cents), 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

const EVENT_LABEL: Record<string, string> = {
  'account.created': 'Account created', 'job.created': 'Subagent requested', 'job.launching': 'Machine requested', 'job.booting': 'Machine booting',
  'job.fetching_image': 'Loading image', 'job.enclave_starting': 'Starting enclave', 'job.awaiting_input': 'Enclave attested',
  'job.input_sealed': 'Sealed task delivered', 'job.running': 'Working', 'job.done': 'Done', 'job.failed': 'Failed',
  'job.killed': 'Killed by you', 'job.expired': 'Expired', 'token.created': 'Token created', 'token.revoked': 'Token revoked',
  'token.device_approved': 'MCP connected',
}

function Activity() {
  const rows = usePoll<Ev[]>('/api/events?limit=300', 5000)
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">logs</span><h1>Activity</h1></div></div>
      <div className="card" style={{ padding: 10 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Event</th><th>Subagent</th><th>Detail</th></tr></thead>
            <tbody>
              {(rows.data ?? []).map((e, i) => (
                <tr key={i}>
                  <td className="faint mono" style={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</td>
                  <td>{EVENT_LABEL[e.kind] ?? e.kind}</td>
                  <td className="mono faint">{e.job_id ?? ''}</td>
                  <td className="faint" style={{ fontSize: 13 }}>{detail(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/** Motivos do extrato (o servidor gravava em português; os novos já vêm em inglês). */
function reasonLabel(r: string) {
  if (r === 'reserva' || r === 'hold') return 'Hold (max cost)'
  if (r === 'devolução da reserva' || r === 'hold refund') return 'Hold refunded'
  if (r === 'crédito de boas-vindas' || r === 'welcome credit') return 'Welcome credit'
  return r.replace(/^uso /, 'usage ')
}

function detail(e: Ev) {
  const d = e.detail
  if (!d) return ''
  if (d.error) return d.error
  if (d.cost_cents != null) return `${d.secs}s · ${usd(d.cost_cents, 4)}`
  if (d.instance_type) return `${viaLabel(d.client)} → ${engineLabel(d.engine)} · ${d.ram_gb} GB · ${d.instance_type}`
  if (d.client) return d.client
  if (d.gift_cents) return `welcome credit ${usd(d.gift_cents)}`
  return ''
}
