import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ACTIVE, ago, api, ApiError, dur, engineLabel, usd, viaLabel, type Job } from '../api'
import { Logo, Spinner, StatusPill } from '../components/ui'
import { useSession } from '../session'

/** Back office: clientes, subagentes, máquinas e pagamentos. Só metadados — o conteúdo dos subagentes é cifrado. */
function usePoll<T>(path: string, ms = 5000) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try { setData(await api<T>('GET', path)); setErr('') } catch (e) { setErr(e instanceof ApiError ? e.message : 'error') }
  }, [path])
  useEffect(() => {
    load()
    if (!ms) return
    const t = setInterval(() => { if (!document.hidden) load() }, ms)
    return () => clearInterval(t)
  }, [load, ms])
  return { data, err, reload: load }
}

type Overview = {
  users: number; signups_7d: number; signups_30d: number; active_users_7d: number; agents_live: number; agents_queued: number
  agents_24h: number; agents_30d: number; agents_failed_30d: number; revenue_cents: number; payments: number
  machine_cost_cents: number; machine_cost_30d_cents: number; balances_cents: number; free_granted_cents: number
  free_pool_cents: number; max_instances: number
  daily: { day: string; signups: number; jobs: number; revenue_cents: number; cost_cents: number }[]
}
type UserRow = { id: string; email: string; name: string; credit_cents: number; is_admin: number; created_at: number; jobs: number
  live: number; spent_cents: number; paid_cents: number; last_seen: number | null; tokens: number; last_client: string | null }
type AdminJob = Job & { email: string; instance_id: string | null }

export default function Admin() {
  const { me, loading } = useSession()
  const loc = useLocation()
  if (loading) return <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}><Spinner size={24} /></div>
  if (!me) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname)}`} replace />
  if (!me.is_admin) return <Navigate to="/painel" replace />
  const links: [string, string][] = [['/admin', 'Overview'], ['/admin/clientes', 'Customers'], ['/admin/subagentes', 'Subagents'], ['/admin/maquinas', 'Machines'], ['/admin/pagamentos', 'Payments']]
  return (
    <div className="dash">
      <aside className="side">
        <Logo />
        <span className="admin-badge mono">BACK OFFICE</span>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/admin'}>
              {({ isActive }) => <>{isActive && <motion.span layoutId="admin-active" className="active-bg" />}{label}</>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot"><Link className="btn ghost sm" to="/painel">← My dashboard</Link></div>
      </aside>
      <main className="main">
        <p className="faint mono admin-note">metadata only — tasks, code and results stay encrypted, even for admins</p>
        <Routes location={loc}>
          <Route index element={<AdminOverview />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="subagentes" element={<Agents />} />
          <Route path="maquinas" element={<Machines />} />
          <Route path="pagamentos" element={<Payments />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}

const Kpi = ({ l, v, sub, glow }: { l: string; v: string | number; sub?: string; glow?: boolean }) => (
  <div className={`card kpi ${glow ? 'glow' : ''}`}><div className="l">{l}</div><div className="v">{v}</div>{sub && <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{sub}</div>}</div>
)

function AdminOverview() {
  const o = usePoll<Overview>('/api/admin/overview', 10000).data
  if (!o) return <div className="empty"><Spinner /></div>
  const margin = o.revenue_cents - o.machine_cost_cents
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">back office</span><h1>Overview</h1></div></div>
      <div className="kpis">
        <Kpi glow l="Customers" v={o.users} sub={`+${o.signups_7d} in 7 days · +${o.signups_30d} in 30`} />
        <Kpi l="Active customers (7 days)" v={o.active_users_7d} sub="ran at least one subagent" />
        <Kpi l="Subagents live" v={o.agents_live} sub={`${o.agents_queued} queued · limit ${o.max_instances} machine(s)`} />
        <Kpi l="Subagents" v={o.agents_24h} sub={`24 h · ${o.agents_30d} in 30 days · ${o.agents_failed_30d} failed`} />
      </div>
      <div className="kpis" style={{ marginTop: 14 }}>
        <Kpi l="Revenue (card)" v={usd(o.revenue_cents)} sub={`${o.payments} payment(s)`} />
        <Kpi l="AWS machine cost" v={usd(o.machine_cost_cents, 3)} sub={`${usd(o.machine_cost_30d_cents, 3)} in 30 days`} />
        <Kpi l="Revenue − machine cost" v={usd(margin)} />
        <Kpi l="Credit in balances" v={usd(o.balances_cents)} sub={`free credit given ${usd(o.free_granted_cents)} of ${usd(o.free_pool_cents)}`} />
      </div>
      <h2 style={{ fontSize: 18, margin: '32px 0 12px' }}>Last 30 days</h2>
      <div className="card"><Daily rows={o.daily} /></div>
    </>
  )
}

function Daily({ rows }: { rows: Overview['daily'] }) {
  const series = useMemo(() => {
    const m = new Map(rows.map((r) => [r.day, r]))
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400_000).toISOString().slice(0, 10)
      return { d, r: m.get(d) }
    })
  }, [rows])
  const max = Math.max(1, ...series.map((s) => s.r?.jobs ?? 0))
  const [hover, setHover] = useState<number | null>(null)
  if (!rows.length) return <p className="muted" style={{ margin: 0, textAlign: 'center', padding: 24 }}>No activity yet.</p>
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <div className="daily">
        {series.map((s, i) => (
          <div key={s.d} className="daily-col" onMouseEnter={() => setHover(i)}>
            <i style={{ height: `${((s.r?.jobs ?? 0) / max) * 100}%` }} />
            {(s.r?.signups ?? 0) > 0 && <b title="sign-ups">{s.r!.signups}</b>}
          </div>
        ))}
      </div>
      <div className="faint mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6 }}>
        <span>{series[0].d}</span><span>bars = subagents · number = sign-ups</span><span>{series[29].d}</span>
      </div>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((hover + 0.5) / 30) * 100}%`, top: 10 }}>
          <strong>{series[hover].d}</strong><br />
          {series[hover].r?.jobs ?? 0} subagents · {series[hover].r?.signups ?? 0} sign-ups<br />
          revenue {usd(series[hover].r?.revenue_cents ?? 0)} · cost {usd(series[hover].r?.cost_cents ?? 0, 3)}
        </div>
      )}
    </div>
  )
}

function Customers() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t) }, [q])
  const list = usePoll<UserRow[]>(`/api/admin/users?q=${encodeURIComponent(debounced)}`, 15000)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <div className="page-h">
        <div><span className="eyebrow">back office</span><h1>Customers</h1></div>
        <input className="input" style={{ maxWidth: 320 }} placeholder="search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card" style={{ padding: 10 }}>
        {!list.data ? <div className="empty"><Spinner /></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Customer</th><th>Signed up</th><th>Balance</th><th>Subagents</th><th>Spent</th><th>Paid</th><th>Uses</th><th>Last seen</th></tr></thead>
              <tbody>
                {list.data.map((u) => (
                  <Fragment key={u.id}>
                    <tr className="clickable" onClick={() => setOpen(open === u.id ? null : u.id)}>
                      <td><div>{u.email}{u.is_admin ? <span className="pill" style={{ marginLeft: 8 }}>admin</span> : null}</div><div className="faint" style={{ fontSize: 12 }}>{u.name}</div></td>
                      <td className="faint">{ago(u.created_at)}</td>
                      <td className="mono">{usd(u.credit_cents)}</td>
                      <td className="mono">{u.jobs}{u.live > 0 && <span className="pill live" style={{ marginLeft: 6 }}><span className="dot" />{u.live}</span>}</td>
                      <td className="mono">{usd(u.spent_cents, 3)}</td>
                      <td className="mono">{u.paid_cents ? usd(u.paid_cents) : '—'}</td>
                      <td>{u.last_client ? viaLabel(u.last_client) : u.tokens ? 'MCP connected' : '—'}</td>
                      <td className="faint">{u.last_seen ? ago(u.last_seen) : '—'}</td>
                    </tr>
                    <AnimatePresence>
                      {open === u.id && (
                        <tr><td colSpan={8} style={{ padding: 0, borderTop: 0 }}>
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                            <CustomerDetail id={u.id} onChanged={list.reload} />
                          </motion.div>
                        </td></tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
                {list.data.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>No customers found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

type Detail = { user: UserRow; jobs: Job[]; tokens: { id: string; prefix: string; label: string; created_at: number; last_used_at: number | null; revoked_at: number | null }[]
  ledger: { job_id: string | null; at: number; cents: number; reason: string }[]; payments: { session_id: string; cents: number; status: string; created_at: number }[] }

function CustomerDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const d = usePoll<Detail>(`/api/admin/users/${id}`, 0)
  const [amount, setAmount] = useState('5')
  const [reason, setReason] = useState('courtesy credit')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const give = async (sign: 1 | -1) => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100) * sign
    if (!cents) return
    if (!confirm(`${sign > 0 ? 'Give' : 'Remove'} ${usd(Math.abs(cents))} ${sign > 0 ? 'to' : 'from'} ${d.data?.user.email}?`)) return
    setBusy(true); setMsg('')
    try { await api('POST', `/api/admin/users/${id}/credit`, { cents, reason }); await d.reload(); onChanged(); setMsg('done ✓') }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'error') } finally { setBusy(false) }
  }
  if (!d.data) return <div className="empty"><Spinner /></div>
  const x = d.data
  return (
    <div className="cust">
      <div className="cust-grid">
        <div className="card">
          <h3 className="cust-h">Adjust credit</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 110 }} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="amount in USD" />
            <input className="input" style={{ flex: 1, minWidth: 180 }} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="reason" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button className="btn primary sm" disabled={busy} onClick={() => give(1)}>Give credit</button>
            <button className="btn sm danger" disabled={busy} onClick={() => give(-1)}>Remove</button>
            <span className="faint" style={{ fontSize: 13 }}>{msg}</span>
          </div>
          <p className="faint" style={{ fontSize: 12, margin: '10px 0 0' }}>Shows up on the customer’s billing page and in their activity.</p>
        </div>
        <div className="card">
          <h3 className="cust-h">Tokens</h3>
          {x.tokens.length === 0 ? <p className="faint" style={{ margin: 0 }}>No MCP connected.</p> : x.tokens.map((t) => (
            <div key={t.id} className="cust-row"><span>{t.label}</span><span className="faint">{t.revoked_at ? 'revoked' : t.last_used_at ? `used ${ago(t.last_used_at)}` : 'never used'}</span></div>
          ))}
        </div>
      </div>
      <h3 className="cust-h" style={{ marginTop: 16 }}>Subagents</h3>
      <JobTable jobs={x.jobs} />
      <div className="cust-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <h3 className="cust-h">Statement</h3>
          {x.ledger.slice(0, 30).map((l, i) => (
            <div key={i} className="cust-row"><span className="faint">{new Date(l.at).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              <span style={{ flex: 1, margin: '0 10px' }}>{l.reason}</span><span className="mono" style={{ color: l.cents >= 0 ? 'var(--ok)' : undefined }}>{l.cents >= 0 ? '+' : '−'}{usd(Math.abs(l.cents), 4)}</span></div>
          ))}
        </div>
        <div className="card">
          <h3 className="cust-h">Payments</h3>
          {x.payments.length === 0 ? <p className="faint" style={{ margin: 0 }}>No payments yet.</p> : x.payments.map((p) => (
            <div key={p.session_id} className="cust-row"><span className="faint">{ago(p.created_at)}</span><span className="mono">{usd(p.cents)}</span><span className={p.status === 'paid' ? 'okc' : 'faint'}>{p.status}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}

function JobTable({ jobs, withUser, onKill }: { jobs: (Job & { email?: string })[]; withUser?: boolean; onKill?: (id: string) => void }) {
  if (!jobs.length) return <p className="faint" style={{ margin: '4px 0' }}>None.</p>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>ID</th>{withUser && <th>Customer</th>}<th>Status</th><th>Via → engine</th><th>RAM</th><th>Peak</th><th>Duration</th><th>Cost</th><th>When</th>{onKill && <th />}</tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="mono">{j.id}{j.error && <div className="faint" style={{ fontSize: 11.5, maxWidth: 260, whiteSpace: 'normal' }}>{j.error}</div>}</td>
              {withUser && <td>{j.email}</td>}
              <td><StatusPill status={j.status} /></td>
              <td>{viaLabel(j.client)} → {engineLabel(j.engine)}</td>
              <td className="mono">{j.ram_gb} GB</td>
              <td className="mono">{j.peak_mem_mib ? `${(j.peak_mem_mib / 1024).toFixed(1)} GB` : '—'}</td>
              <td className="mono">{j.finished_at && j.launched_at ? dur((j.finished_at - j.launched_at) / 1000) : ACTIVE.includes(j.status) ? '…' : '—'}</td>
              <td className="mono">{j.cost_cents != null ? usd(j.cost_cents, 4) : '—'}</td>
              <td className="faint">{ago(j.created_at)}</td>
              {onKill && <td>{ACTIVE.includes(j.status) || j.status === 'queued' ? <button className="btn sm danger" onClick={() => onKill(j.id)}>Kill</button> : null}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Agents() {
  const live = usePoll<AdminJob[]>('/api/admin/jobs?live=1', 3000)
  const recent = usePoll<AdminJob[]>('/api/admin/jobs', 10000)
  const kill = async (id: string) => {
    if (!confirm(`Kill ${id}? The customer's machine is destroyed immediately.`)) return
    await api('DELETE', `/api/admin/jobs/${id}`).catch(() => {}); live.reload(); recent.reload()
  }
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">back office</span><h1>Subagents</h1></div></div>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Live now</h2>
      <div className="card" style={{ padding: 10 }}>{live.data ? <JobTable jobs={live.data} withUser onKill={kill} /> : <Spinner />}</div>
      <h2 style={{ fontSize: 16, margin: '26px 0 10px' }}>Recent</h2>
      <div className="card" style={{ padding: 10 }}>{recent.data ? <JobTable jobs={recent.data} withUser /> : <Spinner />}</div>
    </>
  )
}

function Machines() {
  const m = usePoll<{ id: string; job_id: string | null; launched_at: number | null; job_status: string | null; email: string | null; orphan: boolean }[]>('/api/admin/instances', 10000)
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">back office · aws</span><h1>Machines</h1></div></div>
      <p className="muted" style={{ marginTop: -10 }}>EC2 instances tagged for ramwisp that are running right now. Orphans (no active subagent) are terminated automatically within ~3 minutes.</p>
      <div className="card" style={{ padding: 10 }}>
        {!m.data ? <Spinner /> : m.data.length === 0 ? <p className="faint" style={{ margin: 8 }}>No machines running.</p> : (
          <table className="table">
            <thead><tr><th>Instance</th><th>Subagent</th><th>Customer</th><th>Status</th><th>Up for</th></tr></thead>
            <tbody>{m.data.map((i) => (
              <tr key={i.id}><td className="mono">{i.id}</td><td className="mono">{i.job_id ?? '—'}</td><td>{i.email ?? '—'}</td>
                <td>{i.orphan ? <span className="pill err"><span className="dot" />orphan</span> : <StatusPill status={i.job_status ?? 'running'} />}</td>
                <td className="mono">{i.launched_at ? dur((Date.now() - i.launched_at) / 1000) : '—'}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

function Payments() {
  const p = usePoll<{ session_id: string; cents: number; status: string; created_at: number; paid_at: number | null; email: string }[]>('/api/admin/payments', 15000)
  const total = (p.data ?? []).filter((x) => x.status === 'paid').reduce((a, x) => a + x.cents, 0)
  return (
    <>
      <div className="page-h"><div><span className="eyebrow">back office · stripe</span><h1>Payments</h1></div><div className="card" style={{ padding: '10px 18px' }}>Paid <strong>{usd(total)}</strong></div></div>
      <div className="card" style={{ padding: 10 }}>
        {!p.data ? <Spinner /> : p.data.length === 0 ? <p className="faint" style={{ margin: 8 }}>No payments yet.</p> : (
          <table className="table">
            <thead><tr><th>When</th><th>Customer</th><th>Amount</th><th>Status</th><th>Stripe session</th></tr></thead>
            <tbody>{p.data.map((x) => (
              <tr key={x.session_id}><td className="faint">{ago(x.paid_at ?? x.created_at)}</td><td>{x.email}</td><td className="mono">{usd(x.cents)}</td>
                <td className={x.status === 'paid' ? 'okc' : 'faint'}>{x.status}</td><td className="mono faint" style={{ fontSize: 12 }}>{x.session_id.slice(0, 24)}…</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}
