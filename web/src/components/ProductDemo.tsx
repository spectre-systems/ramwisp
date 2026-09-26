import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { GhostMark } from './Mark'

/**
 * Demonstração do produto na primeira tela, no formato real de cada cliente:
 *  - Claude Code: "> pedido", "⏺ ramwisp - spawn_agent (MCP)(…)", "⎿ {json que o MCP devolve}", "⏺ Bash(git apply …)";
 *  - Codex: "user" / "codex" / "mcp: ramwisp/spawn_agent started|(completed)" / "exec … succeeded in 38ms"
 *    (copiado de uma sessão real do Codex com o MCP ramwisp).
 * À direita, o que acontece de fato: o notebook fica leve e 4 máquinas atestadas trabalham.
 */
type Phase = 'idle' | 'boot' | 'run' | 'done'
type Line = { cls: string; text: string; phase: Phase }
type Job = { name: string; mission: string; result: string; patch?: string }
type Scenario = { tab: string; ask: string; intro: string; jobs: Job[]; done: string }

const IDS = ['wp-3fa91c20', 'wp-8b20de14', 'wp-c4417a09', 'wp-51e0b7d2']
const SCENARIOS: Scenario[] = [
  { tab: 'Tests', ask: 'run every package’s tests in parallel and fix whatever breaks',
    intro: 'I’ll give each package its own ramwisp subagent with 8 GB.',
    jobs: [
      { name: 'api', mission: 'Run the tests in packages/api and fix failures', result: '2 failing tests fixed', patch: '3 files changed' },
      { name: 'web', mission: 'Run the tests in packages/web and fix failures', result: '214 passing' },
      { name: 'worker', mission: 'Run the tests in packages/worker and fix failures', result: '1 failing test fixed', patch: '1 file changed' },
      { name: 'shared', mission: 'Run the tests in packages/shared and fix failures', result: '88 passing' },
    ],
    done: 'All 4 finished. Applied 2 patches — the whole suite passes.' },
  { tab: 'Build', ask: 'build web, iOS, Android and the API and tell me what failed',
    intro: 'Four builds at once won’t fit here — sending each to its own machine.',
    jobs: [
      { name: 'web', mission: 'Production build of apps/web', result: 'build ok in 48s' },
      { name: 'ios', mission: 'Release build of apps/ios', result: 'missing CocoaPod, added it', patch: '2 files changed' },
      { name: 'android', mission: 'Release build of apps/android', result: 'build ok in 2m10s' },
      { name: 'api', mission: 'Build and typecheck services/api', result: 'build ok in 31s' },
    ],
    done: 'Only iOS failed — a missing pod. Patch applied, all 4 build now.' },
  { tab: 'Browser', ask: 'test the 4 checkout flows in a headless browser',
    intro: 'Each flow gets its own machine with a headless Chromium.',
    jobs: [
      { name: 'card', mission: 'E2E: checkout paying by card', result: 'paid in 3.1s' },
      { name: 'paypal', mission: 'E2E: checkout paying with PayPal', result: 'paid in 4.0s' },
      { name: 'apple-pay', mission: 'E2E: checkout with Apple Pay on mobile', result: 'button hidden on mobile, fixed CSS', patch: '1 file changed' },
      { name: 'coupon', mission: 'E2E: checkout with a 10% coupon', result: 'discount applied' },
    ],
    done: 'Apple Pay was broken on mobile; the CSS fix is applied. 4/4 green.' },
  { tab: 'Research', ask: 'compare 4 job-queue libraries and benchmark each one',
    intro: 'One subagent per library, same benchmark on identical 8 GB machines.',
    jobs: [
      { name: 'bullmq', mission: 'Benchmark bullmq: 1M jobs, report jobs/s', result: '41k jobs/s' },
      { name: 'pg-boss', mission: 'Benchmark pg-boss: 1M jobs, report jobs/s', result: '9k jobs/s' },
      { name: 'bee', mission: 'Benchmark bee-queue: 1M jobs, report jobs/s', result: '33k jobs/s' },
      { name: 'agenda', mission: 'Benchmark agenda: 1M jobs, report jobs/s', result: '3k jobs/s' },
    ],
    done: 'BullMQ wins by a wide margin (41k jobs/s). Full report in bench.md.' },
]

function claudeLines(sc: Scenario): Line[] {
  const patched = sc.jobs.map((j, i) => ({ ...j, id: IDS[i] })).filter((j) => j.patch)
  return [
    { cls: 'cc-you', text: `> ${sc.ask}`, phase: 'idle' },
    { cls: 'cc-say', text: `⏺ ${sc.intro}`, phase: 'idle' },
    { cls: 'cc-tool', text: `⏺ ramwisp - spawn_agent (MCP)(mission: "${sc.jobs[0].mission}", ram_gb: 8, workspace: ".")`, phase: 'boot' },
    { cls: 'cc-out', text: `  ⎿  { "id": "${IDS[0]}", "status": "launching", "instance_type": "m7i.xlarge" }`, phase: 'boot' },
    { cls: 'cc-dim', text: '  … +3 more spawn_agent calls', phase: 'boot' },
    { cls: 'cc-tool', text: `⏺ ramwisp - wait_agent (MCP)(id: "${IDS[0]}")`, phase: 'run' },
    { cls: 'cc-out', text: `  ⎿  { "status": "done", "result": "${sc.jobs[0].result}"${sc.jobs[0].patch ? `, "patch_stat": "${sc.jobs[0].patch}"` : ''} }`, phase: 'run' },
    { cls: 'cc-dim', text: '  … +3 more wait_agent calls', phase: 'run' },
    ...patched.map((j) => ({ cls: 'cc-tool', text: `⏺ Bash(git apply ~/.config/wisp/patches/${j.id}.patch)`, phase: 'done' as Phase })),
    ...(patched.length ? [{ cls: 'cc-out', text: '  ⎿  (No content)', phase: 'done' as Phase }] : []),
    { cls: 'cc-say', text: `⏺ ${sc.done}`, phase: 'done' },
  ]
}

function codexLines(sc: Scenario): Line[] {
  const patched = sc.jobs.map((j, i) => ({ ...j, id: IDS[i] })).filter((j) => j.patch)
  return [
    { cls: 'cx-role', text: 'user', phase: 'idle' },
    { cls: 'cx-text', text: sc.ask, phase: 'idle' },
    { cls: 'cx-codex', text: 'codex', phase: 'idle' },
    { cls: 'cx-text', text: sc.intro, phase: 'idle' },
    ...sc.jobs.map((_, i) => ({ cls: 'cx-mcp', text: `mcp: ramwisp/spawn_agent ${i < 3 ? 'started' : '(completed)'}`, phase: 'boot' as Phase })),
    { cls: 'cx-mcp', text: 'mcp: ramwisp/wait_agent (completed)  ×4', phase: 'run' },
    ...sc.jobs.map((j) => ({ cls: 'cx-res', text: `  ${j.name.padEnd(9)} ✓ ${j.result}`, phase: 'run' as Phase })),
    ...(patched.length ? [
      { cls: 'cx-exec', text: 'exec', phase: 'done' as Phase },
      { cls: 'cx-text', text: `bash -lc 'git apply ${patched.map((j) => `${j.id}.patch`).join(' ')}' in ~/project`, phase: 'done' as Phase },
      { cls: 'cx-ok', text: 'succeeded in 38ms:', phase: 'done' as Phase },
    ] : []),
    { cls: 'cx-codex', text: 'codex', phase: 'done' },
    { cls: 'cx-text', text: sc.done, phase: 'done' },
  ]
}

function uptime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60)
  return [h, m, x].map((v) => String(v).padStart(2, '0')).join(':')
}

export function ProductDemo() {
  const [client, setClient] = useState<'claude' | 'codex'>('claude')
  const [tab, setTab] = useState(0)
  const [auto, setAuto] = useState(true)
  const [step, setStep] = useState(0)
  const [secs, setSecs] = useState(1337)
  const sc = SCENARIOS[tab]
  const lines = useMemo(() => (client === 'claude' ? claudeLines(sc) : codexLines(sc)), [client, sc])
  const TOTAL = lines.length

  useEffect(() => { setStep(0) }, [tab, client])
  useEffect(() => {
    const t = setTimeout(() => {
      if (step < TOTAL) setStep(step + 1)
      else if (auto) setTab((x) => (x + 1) % SCENARIOS.length)
    }, step === 0 ? 500 : step < TOTAL ? 520 : 3800)
    return () => clearTimeout(t)
  }, [step, TOTAL, auto])
  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [])

  // ao trocar de cenário/cliente, step ainda é o do anterior por um render (e cada cenário tem um nº de linhas)
  const shown = Math.min(step, TOTAL)
  const phase: Phase = shown === 0 ? 'idle' : lines[shown - 1]?.phase ?? 'done'
  const status = (i: number) => phase === 'idle' ? '—' : phase === 'boot' ? 'attesting' : phase === 'run' ? (i <= step % 4 ? 'done' : 'running') : 'evaporated'

  return (
    <div className="demo">
      <div className="demo-bar">
        <span className="demo-client mono" role="tablist">
          {(['claude', 'codex'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={client === k} className={client === k ? 'on' : ''} onClick={() => { setClient(k); setAuto(false) }}>{k === 'claude' ? 'Claude Code' : 'Codex'}</button>
          ))}
        </span>
        <span className="mono dim">~/project</span>
        <span className="demo-chip mono">us-east-1</span>
      </div>
      <div className="demo-body">
        <div className={`demo-term mono ${client}`}>
          <AnimatePresence mode="popLayout">
            {lines.slice(0, shown).map((l, i) => (
              <motion.div key={`${client}-${tab}-${i}`} className={`dl ${l.cls}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>{l.text}</motion.div>
            ))}
          </AnimatePresence>
          {shown < TOTAL && <span className="caret" />}
        </div>
        <div className="demo-side">
          <div className="side-block">
            <div className="side-h mono"><span>YOUR LAPTOP · 16 GB</span><span className="okc">{phase === 'idle' ? '34%' : '31%'}</span></div>
            <div className="meter"><motion.i animate={{ width: phase === 'idle' ? '34%' : '31%' }} /></div>
            <div className="side-note mono dim">{phase === 'idle' ? 'free for you' : '4 subagents running elsewhere'}</div>
          </div>
          <div className="side-block">
            <div className="side-h mono"><span>MACHINES</span><span className="dim">nitro enclave</span></div>
            {sc.jobs.map((j, i) => {
              const st = status(i)
              const ram = phase === 'run' ? [62, 48, 71, 39][i] : phase === 'boot' ? 8 : 0
              const cls = st === 'running' || st === 'attesting' ? 'rodando' : st === 'done' ? 'pronto' : st === 'evaporated' ? 'evaporou' : ''
              return (
                <div key={j.name} className={`vm-row ${cls}`}>
                  <GhostMark size={16} />
                  <span className="mono vm-name">{j.name}</span>
                  <span className="meter sm"><motion.i animate={{ width: `${ram}%` }} transition={{ duration: 0.8 }} /></span>
                  <span className="mono vm-st">{st}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="demo-foot mono">
        <span>ENCLAVE ATTESTED <span className="dim">· PCR0 32d2…d0a4e</span></span>
        <span><span className="live-dot" /> UPTIME {uptime(secs)}</span>
      </div>
      <div className="demo-tabs" role="tablist">
        {SCENARIOS.map((s, i) => (
          <button key={s.tab} role="tab" aria-selected={i === tab} className={i === tab ? 'on' : ''} onClick={() => { setTab(i); setAuto(false) }}>{s.tab}</button>
        ))}
      </div>
    </div>
  )
}
