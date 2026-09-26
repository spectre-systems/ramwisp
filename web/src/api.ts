export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Wisp': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!r.ok) throw new ApiError(r.status, data?.error ?? `HTTP ${r.status}`);
  return data as T;
}

export type Tier = { ram_gb: number; available: boolean; instance_type?: string; rate_cents_h?: number };
export type Me = { id: string; email: string; name: string; credit_cents: number; is_admin: boolean; tiers: Tier[] };
export type Job = {
  id: string; label: string | null; engine: 'claude' | 'codex'; client: string | null; ram_gb: number; timeout_s: number; status: string;
  instance_type: string; enclave_mem_mib: number; enclave_cpus: number; mem_used_mib: number | null;
  mem_total_mib: number | null; peak_mem_mib: number | null; exit_code: number | null; duration_s: number | null;
  egress: Record<string, number>; error: string | null; cost_cents: number | null; hold_cents: number;
  rate_cents_h: number; created_at: number; launched_at: number | null; attested_at: number | null;
  started_at: number | null; finished_at: number | null; collected_at: number | null;
};
export type Token = { id: string; prefix: string; label: string; created_at: number; last_used_at: number | null; revoked_at: number | null };
export type Ledger = { job_id: string | null; at: number; cents: number; reason: string };
export type Ev = { job_id: string | null; at: number; kind: string; detail: any };
export type Day = { day: string; jobs: number; cost_cents: number; gb_hours: number };
export type PublicInfo = {
  pcrs: { pcr0: string[]; builds?: Record<string, string> } | null; tiers: number[];
  instance_types: { type: string; vcpus: number; memMib: number; usdHour: number }[];
  signup_credit_cents: number; active_agents: number; agents_done: number; free_left_cents: number;
};

export const ACTIVE = ['launching', 'booting', 'fetching_image', 'enclave_starting', 'awaiting_input', 'running'];
export const usd = (cents: number | null | undefined, digits = 2) =>
  cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const STATUS_LABEL: Record<string, string> = {
  queued: 'queued', launching: 'requesting machine', booting: 'booting', fetching_image: 'loading image',
  enclave_starting: 'starting enclave', awaiting_input: 'attested · sealing', running: 'working',
  done: 'done', failed: 'failed', killed: 'killed', expired: 'expired',
};

export const origin = () => window.location.origin;
export const installCmd = () => 'claude mcp add --scope user ramwisp -- npx -y ramwisp@latest';
export const codexToml = () => '[mcp_servers.ramwisp]\ncommand = "npx"\nargs = ["-y", "ramwisp@latest"]\ntool_timeout_sec = 1000';

export function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

export function dur(s: number | null | undefined) {
  if (s == null) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}min ${Math.round(s % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}min`;
}

/** Nome amigável de quem pediu o subagente (clientInfo do MCP). */
export function viaLabel(client: string | null | undefined) {
  const c = (client ?? '').toLowerCase()
  if (!c) return '—'
  if (c.includes('claude')) return 'Claude Code'
  if (c.includes('codex')) return 'Codex'
  if (c === 'cli') return 'CLI'
  return client as string
}
export const engineLabel = (e: string) => (e === 'codex' ? 'Codex' : 'Claude')
