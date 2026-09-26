import { Hono } from "hono";
import { type AuthVars, requireUser } from "./auth.ts";
import { config } from "./config.ts";
import { credit, db, event, kvGet, now } from "./db.ts";
import { ACTIVE, FINAL, finish, getJob, publicJob, type Job } from "./jobs.ts";
import { liveInstances } from "./launcher.ts";

/**
 * Back office (/api/admin/*): só contas com is_admin. Mostra apenas metadados — missão, código e resultado
 * continuam cifrados para a enclave e para o cliente, nem o admin consegue ler.
 */
export const admin = new Hono<{ Variables: AuthVars }>();
admin.use("*", requireUser, async (c, next) => {
  if (!c.get("user").is_admin) return c.json({ error: "admins only" }, 403);
  await next();
});

const DAY = 86400_000;
const one = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
const inList = (xs: string[]) => xs.map(() => "?").join(",");

admin.get("/overview", (c) => {
  const t = now()
  const paid = one("SELECT COALESCE(SUM(cents),0) AS c, COUNT(*) AS n FROM payments WHERE status = 'paid'")
  return c.json({
    users: one("SELECT COUNT(*) AS n FROM users").n,
    signups_7d: one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", t - 7 * DAY).n,
    signups_30d: one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", t - 30 * DAY).n,
    active_users_7d: one("SELECT COUNT(DISTINCT user_id) AS n FROM jobs WHERE created_at > ?", t - 7 * DAY).n,
    agents_live: one(`SELECT COUNT(*) AS n FROM jobs WHERE status IN (${inList(ACTIVE)})`, ...ACTIVE).n,
    agents_queued: one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'").n,
    agents_24h: one("SELECT COUNT(*) AS n FROM jobs WHERE created_at > ?", t - DAY).n,
    agents_30d: one("SELECT COUNT(*) AS n FROM jobs WHERE created_at > ?", t - 30 * DAY).n,
    agents_failed_30d: one("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('failed','expired') AND created_at > ?", t - 30 * DAY).n,
    revenue_cents: paid.c, payments: paid.n,
    machine_cost_cents: one("SELECT COALESCE(SUM(cost_cents),0) AS c FROM jobs").c,
    machine_cost_30d_cents: one("SELECT COALESCE(SUM(cost_cents),0) AS c FROM jobs WHERE created_at > ?", t - 30 * DAY).c,
    balances_cents: one("SELECT COALESCE(SUM(credit_cents),0) AS c FROM users").c,
    free_granted_cents: Number(kvGet("free_granted_cents") ?? 0), free_pool_cents: config.freePoolCents,
    max_instances: config.maxInstances,
    daily: all(`SELECT d AS day, SUM(signups) AS signups, SUM(jobs) AS jobs, SUM(revenue) AS revenue_cents, SUM(cost) AS cost_cents FROM (
        SELECT date(created_at/1000,'unixepoch') AS d, 1 AS signups, 0 AS jobs, 0 AS revenue, 0 AS cost FROM users WHERE created_at > ?1
        UNION ALL SELECT date(created_at/1000,'unixepoch'), 0, 1, 0, COALESCE(cost_cents,0) FROM jobs WHERE created_at > ?1
        UNION ALL SELECT date(paid_at/1000,'unixepoch'), 0, 0, cents, 0 FROM payments WHERE status='paid' AND paid_at > ?1
      ) GROUP BY d ORDER BY d`, t - 30 * DAY),
  });
});

admin.get("/users", (c) => {
  const q = `%${(c.req.query("q") ?? "").trim().toLowerCase()}%`;
  return c.json(all(`SELECT u.id, u.email, u.name, u.credit_cents, u.is_admin, u.created_at,
      (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id) AS jobs,
      (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id AND j.status IN (${inList(ACTIVE)})) AS live,
      (SELECT COALESCE(SUM(cost_cents),0) FROM jobs j WHERE j.user_id = u.id) AS spent_cents,
      (SELECT COALESCE(SUM(cents),0) FROM payments p WHERE p.user_id = u.id AND p.status = 'paid') AS paid_cents,
      (SELECT MAX(at) FROM events e WHERE e.user_id = u.id) AS last_seen,
      (SELECT COUNT(*) FROM api_tokens t WHERE t.user_id = u.id AND t.revoked_at IS NULL) AS tokens,
      (SELECT j.client FROM jobs j WHERE j.user_id = u.id AND j.client IS NOT NULL ORDER BY j.created_at DESC LIMIT 1) AS last_client
    FROM users u WHERE lower(u.email) LIKE ? OR lower(u.name) LIKE ? ORDER BY u.created_at DESC LIMIT 500`, ...ACTIVE, q, q));
});

admin.get("/users/:id", (c) => {
  const id = c.req.param("id");
  const user = one("SELECT id, email, name, credit_cents, is_admin, created_at FROM users WHERE id = ?", id);
  if (!user) return c.json({ error: "not found" }, 404);
  return c.json({
    user,
    jobs: (all("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", id) as Job[]).map(publicJob),
    tokens: all("SELECT id, prefix, label, created_at, last_used_at, revoked_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC", id),
    ledger: all("SELECT job_id, at, cents, reason FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 200", id),
    payments: all("SELECT session_id, cents, status, created_at, paid_at FROM payments WHERE user_id = ? ORDER BY created_at DESC", id),
    events: all("SELECT job_id, at, kind, detail FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 100", id)
      .map((r: any) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })),
  });
});

/** Dar ou tirar crédito na mão (cortesia, estorno, ajuste). Fica no extrato do cliente e na atividade. */
admin.post("/users/:id/credit", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const cents = Math.round(Number(b.cents));
  const reason = String(b.reason ?? "").trim().slice(0, 120) || "adjustment";
  if (!Number.isFinite(cents) || cents === 0 || Math.abs(cents) > 100_000) return c.json({ error: "cents: non-zero, up to ±100000" }, 400);
  if (!one("SELECT 1 FROM users WHERE id = ?", id)) return c.json({ error: "not found" }, 404);
  credit(id, cents, `${cents > 0 ? "credit" : "debit"} by ramwisp: ${reason}`);
  event(id, null, "account.credit_adjusted", { cents, reason, by: c.get("user").email });
  return c.json(one("SELECT id, credit_cents FROM users WHERE id = ?", id));
});

admin.get("/jobs", (c) => {
  const live = c.req.query("live") === "1";
  const rows = live
    ? all(`SELECT j.*, u.email FROM jobs j JOIN users u ON u.id = j.user_id WHERE j.status IN (${inList([...ACTIVE, "queued"])}) ORDER BY j.created_at DESC`, ...ACTIVE, "queued")
    : all("SELECT j.*, u.email FROM jobs j JOIN users u ON u.id = j.user_id ORDER BY j.created_at DESC LIMIT 300");
  return c.json(rows.map((j: any) => ({ ...publicJob(j), email: j.email, instance_id: j.instance_id })));
});

admin.delete("/jobs/:id", async (c) => {
  const j = getJob(c.req.param("id"));
  if (!j) return c.json({ error: "not found" }, 404);
  if (!FINAL.includes(j.status)) await finish(j, "killed", `killed by ramwisp admin`);
  return c.json(publicJob(getJob(j.id)!));
});

admin.get("/payments", (c) => c.json(all(`SELECT p.session_id, p.cents, p.status, p.created_at, p.paid_at, u.email
  FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 300`)));

admin.get("/instances", async (c) => {
  const live = await liveInstances();
  return c.json(live.map((i) => {
    const j = i.jobId ? getJob(i.jobId) : undefined;
    const email = j ? (one("SELECT email FROM users WHERE id = ?", j.user_id)?.email ?? null) : null;
    return { id: i.id, job_id: i.jobId ?? null, launched_at: i.launchedAt?.getTime() ?? null, job_status: j?.status ?? null, email,
      orphan: !j || FINAL.includes(j.status) };
  }));
});
