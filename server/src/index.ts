import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  type AuthVars, SESSION_COOKIE, checkPassword, createApiToken, createSession, hashPassword, randomId,
  requireUser, sha256,
} from "./auth.ts";
import { config, INSTANCE_TYPES, RAM_TIERS, pickInstance } from "./config.ts";
import { credit, db, event, kvGet, kvSet, now } from "./db.ts";
import { admin } from "./admin.ts";
import { TOPUP_OPTIONS_USD, createCheckout, handleEvent, paymentStatus, stripeEnabled, verifyWebhook } from "./stripe.ts";
import { ACTIVE, FINAL, HttpError, type Job, createJob, finish, getJob, publicJob, setStatus, startLoops, tick } from "./jobs.ts";

const app = new Hono<{ Variables: AuthVars & { job: Job } }>();
const ROOT = new URL("../..", import.meta.url).pathname;

app.onError((e, c) => {
  if (e instanceof HttpError) return c.json({ error: e.message }, e.status as any);
  console.error(e);
  return c.json({ error: "internal error" }, 500);
});

// ---------------------------------------------------------------- limite simples por IP

const hits = new Map<string, number[]>();
function limited(c: any, key: string, max: number, windowMs: number) {
  const ip = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0] ?? "local";
  const k = `${key}:${ip}`;
  const arr = (hits.get(k) ?? []).filter((t) => t > Date.now() - windowMs);
  arr.push(Date.now());
  hits.set(k, arr);
  return arr.length > max;
}

// ---------------------------------------------------------------- contas

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

function startSession(c: any, userId: string) {
  const s = createSession(userId);
  setCookie(c, SESSION_COOKIE, s.token, { httpOnly: true, secure: config.secureCookies, sameSite: "Lax", path: "/", maxAge: s.maxAge });
}

app.post("/api/auth/signup", async (c) => {
  if (limited(c, "signup", 5, 3600_000)) return c.json({ error: "too many attempts, try again later" }, 429);
  const b = await c.req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim().slice(0, 80) || email.split("@")[0];
  const pw = String(b.password ?? "");
  if (!emailOk(email)) return c.json({ error: "invalid email" }, 400);
  if (pw.length < 8) return c.json({ error: "password must be at least 8 characters" }, 400);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return c.json({ error: "that email already has an account" }, 409);
  const id = randomId("usr_");
  const first = !(db.prepare("SELECT 1 FROM users LIMIT 1").get());
  db.prepare("INSERT INTO users (id, email, name, pass_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, email, name, hashPassword(pw), first ? 1 : 0, now());
  const granted = Number(kvGet("free_granted_cents") ?? 0);
  let gift = 0;
  if (granted + config.signupCreditCents <= config.freePoolCents) {
    gift = config.signupCreditCents;
    kvSet("free_granted_cents", String(granted + gift));
    credit(id, gift, "welcome credit");
  }
  event(id, null, "account.created", { gift_cents: gift });
  startSession(c, id);
  return c.json({ ok: true, gift_cents: gift });
});

app.post("/api/auth/login", async (c) => {
  if (limited(c, "login", 10, 600_000)) return c.json({ error: "too many attempts, wait a few minutes" }, 429);
  const b = await c.req.json().catch(() => ({}));
  const u = db.prepare("SELECT id, pass_hash FROM users WHERE email = ?").get(String(b.email ?? "").trim().toLowerCase()) as
    { id: string; pass_hash: string } | undefined;
  if (!u || !checkPassword(String(b.password ?? ""), u.pass_hash)) return c.json({ error: "wrong email or password" }, 401);
  startSession(c, u.id);
  return c.json({ ok: true });
});

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- login do MCP pelo navegador (device flow)

const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const userCode = () => Array.from(randomBytes(8), (b, i) => (i === 4 ? "-" : "") + USER_CODE_ALPHABET[b % 20]).join("");

app.post("/api/device/start", async (c) => {
  if (limited(c, "device", 30, 3600_000)) return c.json({ error: "too many attempts" }, 429);
  const b = await c.req.json().catch(() => ({}));
  const device = randomBytes(32).toString("base64url");
  const code = userCode();
  db.prepare("INSERT INTO device_codes (device_hash, user_code, client_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(sha256(device), code, String(b.client_name ?? "MCP").slice(0, 60), now(), now() + 900_000);
  const uri = `${config.publicUrl}/ativar`;
  return c.json({ device_code: device, user_code: code, verification_uri: uri,
    verification_uri_complete: `${uri}?code=${code}`, interval: 3, expires_in: 900 });
});

app.post("/api/device/poll", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const row = db.prepare("SELECT * FROM device_codes WHERE device_hash = ?").get(sha256(String(b.device_code ?? ""))) as any;
  if (!row || row.expires_at < now()) return c.json({ error: "expired_token" }, 400);
  if (!row.token) return c.json({ error: "authorization_pending" }, 428);
  db.prepare("DELETE FROM device_codes WHERE device_hash = ?").run(row.device_hash);
  return c.json({ token: row.token });
});

app.get("/api/device/:code", requireUser, (c) => {
  const row = db.prepare("SELECT client_name, expires_at, user_id FROM device_codes WHERE user_code = ?")
    .get(c.req.param("code").toUpperCase()) as any;
  if (!row || row.expires_at < now()) return c.json({ error: "invalid or expired code" }, 404);
  return c.json({ client_name: row.client_name, approved: !!row.user_id });
});

app.post("/api/device/approve", requireUser, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const code = String(b.user_code ?? "").toUpperCase();
  const row = db.prepare("SELECT * FROM device_codes WHERE user_code = ?").get(code) as any;
  if (!row || row.expires_at < now()) return c.json({ error: "invalid or expired code" }, 404);
  if (row.user_id) return c.json({ error: "that code was already used" }, 409);
  const user = c.get("user");
  const tok = createApiToken(user.id, `${row.client_name} (${new Date().toISOString().slice(0, 10)})`);
  db.prepare("UPDATE device_codes SET user_id = ?, token = ? WHERE device_hash = ?").run(user.id, tok.raw, row.device_hash);
  event(user.id, null, "token.device_approved", { client: row.client_name });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- conta, tokens, uso

app.get("/api/me", requireUser, (c) => {
  const u = c.get("user");
  return c.json({ id: u.id, email: u.email, name: u.name, credit_cents: u.credit_cents, is_admin: !!u.is_admin,
    tiers: RAM_TIERS.map((gb) => { const i = pickInstance(gb); return { ram_gb: gb, available: !!i, instance_type: i?.type,
      rate_cents_h: i?.rateCentsHour }; }) });
});

app.get("/api/tokens", requireUser, (c) => c.json(db.prepare(
  "SELECT id, prefix, label, created_at, last_used_at, revoked_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC",
).all(c.get("user").id)));

app.post("/api/tokens", requireUser, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const tok = createApiToken(c.get("user").id, String(b.label ?? "token manual"));
  event(c.get("user").id, null, "token.created", { id: tok.id });
  return c.json({ id: tok.id, token: tok.raw });
});

app.delete("/api/tokens/:id", requireUser, (c) => {
  db.prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .run(now(), c.req.param("id"), c.get("user").id);
  event(c.get("user").id, null, "token.revoked", { id: c.req.param("id") });
  return c.json({ ok: true });
});

app.get("/api/events", requireUser, (c) => {
  const limit = Math.min(500, Number(c.req.query("limit") ?? 100));
  const rows = db.prepare("SELECT job_id, at, kind, detail FROM events WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(c.get("user").id, limit) as any[];
  return c.json(rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })));
});

// ---------------------------------------------------------------- pagamento (Stripe Checkout, crédito pré-pago)

app.get("/api/billing/options", (c) => c.json({ enabled: stripeEnabled(), amounts_usd: TOPUP_OPTIONS_USD }));

app.post("/api/billing/checkout", requireUser, async (c) => {
  if (!stripeEnabled()) return c.json({ error: "payments are not enabled yet" }, 503);
  const b = await c.req.json().catch(() => ({}));
  try {
    const url = await createCheckout(c.get("user"), Number(b.amount_usd));
    return c.json({ url });
  } catch (e: any) {
    console.error("stripe checkout", e);
    return c.json({ error: e?.message ?? "could not start checkout" }, 400);
  }
});

app.get("/api/billing/session/:id", requireUser, (c) => {
  const p = paymentStatus(c.get("user").id, c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "not found" }, 404);
});

app.post("/api/stripe/webhook", async (c) => {
  const raw = await c.req.text();
  if (!verifyWebhook(raw, c.req.header("stripe-signature"))) return c.json({ error: "bad signature" }, 400);
  try {
    const r = handleEvent(JSON.parse(raw));
    return c.json({ received: true, result: r });
  } catch (e) {
    console.error("stripe webhook", e);
    return c.json({ error: "handler failed" }, 500);                // a Stripe tenta de novo
  }
});

app.get("/api/ledger", requireUser, (c) => c.json(db.prepare(
  "SELECT job_id, at, cents, reason FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 200").all(c.get("user").id)));

app.get("/api/usage/daily", requireUser, (c) => c.json(db.prepare(`
  SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS jobs, COALESCE(SUM(cost_cents), 0) AS cost_cents,
         COALESCE(SUM(ram_gb * (COALESCE(finished_at, ?) - COALESCE(launched_at, created_at)) / 3600000.0), 0) AS gb_hours
  FROM jobs WHERE user_id = ? AND created_at > ? GROUP BY day ORDER BY day`).all(now(), c.get("user").id, now() - 30 * 86400_000)));

// ---------------------------------------------------------------- jobs (cliente)

app.get("/api/jobs", requireUser, (c) => {
  const rows = db.prepare("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(c.get("user").id, Math.min(200, Number(c.req.query("limit") ?? 50))) as Job[];
  return c.json(rows.map(publicJob));
});

app.post("/api/jobs", requireUser, async (c) => {
  const client = (c.req.header("x-wisp-client") ?? "").replace(/[^\w .@/-]/g, "").slice(0, 60) || null;
  const j = createJob(c.get("user").id, c.get("tokenId"), await c.req.json().catch(() => ({})), client);
  return c.json(publicJob(j), 201);
});

function ownJob(c: any): Job {
  const j = getJob(c.req.param("id"));
  if (!j || j.user_id !== c.get("user").id) throw new HttpError(404, "job not found");
  return j;
}

app.get("/api/jobs/:id", requireUser, (c) => {
  const j = ownJob(c);
  return c.json({ ...publicJob(j), nonce: j.nonce, attestation: j.attestation,
    output: j.output_sealed ? JSON.parse(j.output_sealed) : null });
});

app.get("/api/jobs/:id/events", requireUser, (c) => {
  const j = ownJob(c);
  const rows = db.prepare("SELECT at, kind, detail FROM events WHERE job_id = ? ORDER BY id").all(j.id) as any[];
  return c.json(rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })));
});

app.post("/api/jobs/:id/input", requireUser, async (c) => {
  const j = ownJob(c);
  if (j.status !== "awaiting_input") return c.json({ error: `job is ${j.status}, not accepting input` }, 409);
  if (j.input_sealed) return c.json({ error: "input already sent" }, 409);
  const b = await c.req.json();
  const s = b.sealed;
  if (!s?.c_pub || !s?.iv || !s?.ct || JSON.stringify(s).length > 25_000_000) return c.json({ error: "invalid sealed input" }, 400);
  db.prepare("UPDATE jobs SET input_sealed = ? WHERE id = ?").run(JSON.stringify({ c_pub: s.c_pub, iv: s.iv, ct: s.ct }), j.id);
  event(j.user_id, j.id, "job.input_sealed");
  return c.json({ ok: true });
});

app.post("/api/jobs/:id/collected", requireUser, (c) => {
  const j = ownJob(c);
  db.prepare("UPDATE jobs SET output_sealed = NULL, collected_at = ? WHERE id = ?").run(now(), j.id);
  return c.json({ ok: true });
});

app.delete("/api/jobs/:id", requireUser, async (c) => {
  const j = ownJob(c);
  if (!FINAL.includes(j.status)) await finish(j, "killed", "killed by the user");
  return c.json(publicJob(getJob(j.id)!));
});

// ---------------------------------------------------------------- hospedeira (token do job)

const agent = new Hono<{ Variables: { job: Job } }>();
agent.use("*", async (c, next) => {
  const raw = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
  const j = db.prepare("SELECT * FROM jobs WHERE job_token_hash = ?").get(sha256(raw)) as Job | undefined;
  if (!j) return c.json({ error: "unknown job" }, 401);
  if (FINAL.includes(j.status)) return c.json({ error: "job finished" }, 410);
  c.set("job", j);
  await next();
});

agent.get("/job", (c) => c.json({ id: c.get("job").id, nonce: c.get("job").nonce }));

const PARENT_PHASES = ["booting", "fetching_image", "enclave_starting", "failed"];
agent.post("/status", async (c) => {
  const j = c.get("job");
  const b = await c.req.json().catch(() => ({}));
  if (!PARENT_PHASES.includes(b.phase)) return c.json({ error: "fase" }, 400);
  if (b.phase === "failed") await finish(j, "failed", String(b.error ?? "falha na máquina").slice(0, 500));
  else setStatus(j, b.phase);
  return c.json({ ok: true });
});

agent.post("/attestation", async (c) => {
  const j = c.get("job");
  const b = await c.req.json();
  if (j.attestation) return c.json({ error: "already attested" }, 409);
  setStatus(j, "awaiting_input", { attestation: String(b.document), attested_at: now() });
  return c.json({ ok: true });
});

agent.get("/input", async (c) => {
  const id = c.get("job").id;
  const until = Date.now() + Math.min(25, Number(c.req.query("wait") ?? 20)) * 1000;
  while (Date.now() < until) {
    const j = getJob(id)!;
    if (FINAL.includes(j.status)) return c.json({ error: "job finished" }, 410);
    if (j.input_sealed) {
      setStatus(j, "running", { started_at: now(), input_sealed: null });
      return c.json({ sealed: JSON.parse(j.input_sealed) });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return c.body(null, 204);
});

agent.post("/stats", async (c) => {
  const b = await c.req.json();
  const j = c.get("job");
  db.prepare("UPDATE jobs SET mem_used_mib = ?, mem_total_mib = ?, peak_mem_mib = MAX(COALESCE(peak_mem_mib, 0), ?), egress = ? WHERE id = ?")
    .run(Number(b.mem_used_mib) || 0, Number(b.mem_total_mib) || 0, Number(b.mem_used_mib) || 0,
      JSON.stringify(b.egress ?? {}).slice(0, 20000), j.id);
  return c.json({ ok: true });
});

agent.post("/output", async (c) => {
  const j = c.get("job");
  const b = await c.req.json();
  const s = b.sealed;
  if (!s?.iv || !s?.ct) return c.json({ error: "invalid output" }, 400);
  db.prepare("UPDATE jobs SET output_sealed = ?, meta = ?, egress = ? WHERE id = ?")
    .run(JSON.stringify({ iv: s.iv, ct: s.ct }), JSON.stringify(b.meta ?? {}), JSON.stringify(b.egress ?? {}).slice(0, 20000), j.id);
  await finish(j, "done");
  return c.json({ ok: true });
});

app.route("/agent", agent);
app.route("/api/admin", admin);

// ---------------------------------------------------------------- público

app.get("/api/public/info", (c) => {
  const pcrs = existsSync(`${ROOT}/mcp/pcrs.json`) ? JSON.parse(readFileSync(`${ROOT}/mcp/pcrs.json`, "utf8")) : null;
  const active = (db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status IN (${ACTIVE.map(() => "?").join(",")})`)
    .get(...ACTIVE) as { n: number }).n;
  const total = (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'done'").get() as { n: number }).n;
  return c.json({ pcrs, tiers: RAM_TIERS.filter((gb) => pickInstance(gb)), instance_types: INSTANCE_TYPES,
    signup_credit_cents: config.signupCreditCents, active_agents: active, agents_done: total,
    free_left_cents: Math.max(0, config.freePoolCents - Number(kvGet("free_granted_cents") ?? 0)) });
});

app.get("/wisp.tgz", (c) => {
  const p = `${ROOT}/server/data/wisp.tgz`;
  if (!existsSync(p)) return c.text("package not published yet", 404);
  c.header("Content-Type", "application/gzip");
  c.header("Cache-Control", "no-cache");
  return c.body(readFileSync(p));
});

// cache: arquivos versionados (/assets/*-hash.js) ficam em cache "para sempre"; o index.html sempre revalida,
// senão um navegador com o index antigo pede JS que não existe mais e a página fica preta
app.use("/assets/*", async (c, next) => { await next(); if (c.res.status === 200) c.header("Cache-Control", "public, max-age=31536000, immutable"); });
app.use("/assets/*", serveStatic({ root: "../web/dist", rewriteRequestPath: (p) => p }));
app.get("/assets/*", (c) => c.text("not found", 404));   // nunca devolver HTML no lugar de JS/CSS
app.use("/*", serveStatic({ root: "../web/dist", rewriteRequestPath: (p) => p,
  onFound: (path, c) => { if (path.endsWith(".html")) c.header("Cache-Control", "no-cache"); } }));
app.get("*", (c) => {
  const index = `${ROOT}/web/dist/index.html`;
  if (c.req.path.startsWith("/api/") || !existsSync(index)) return c.json({ error: "not found" }, 404);
  c.header("Cache-Control", "no-cache");
  return c.html(readFileSync(index, "utf8"));
});

startLoops();
tick().catch(() => {});
serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (i) =>
  console.log(`wisp-saas em http://127.0.0.1:${i.port} (launcher=${config.launcher}, público ${config.publicUrl})`));
