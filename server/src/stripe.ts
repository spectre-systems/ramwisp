import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";
import { credit, db, event, now } from "./db.ts";

/**
 * Pagamento por crédito pré-pago com Stripe Checkout (página hospedada pela Stripe: nunca tocamos em cartão).
 * checkout → Stripe → webhook assinado (checkout.session.completed) → crédito no saldo, uma vez só por sessão.
 * Sem SDK: a API da Stripe é form-encoded e a assinatura do webhook é um HMAC-SHA256.
 */
export const TOPUP_OPTIONS_USD = [10, 25, 50, 100];

db.exec(`CREATE TABLE IF NOT EXISTS payments (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
)`);

export const stripeEnabled = () => !!config.stripeSecretKey;

async function stripe(path: string, params: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await r.json() as any;
  if (!r.ok) throw new Error(data?.error?.message ?? `stripe ${r.status}`);
  return data;
}

export async function createCheckout(user: { id: string; email: string }, amountUsd: number) {
  if (!TOPUP_OPTIONS_USD.includes(amountUsd)) throw new Error(`amount must be one of ${TOPUP_OPTIONS_USD.join(", ")}`);
  const cents = amountUsd * 100;
  const s = await stripe("checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": `ramwisp credit — $${amountUsd}`,
    "line_items[0][price_data][product_data][description]": "Prepaid machine time for ramwisp subagents",
    client_reference_id: user.id,
    customer_email: user.email,
    "metadata[user_id]": user.id,
    "payment_intent_data[metadata][user_id]": user.id,
    success_url: `${config.publicUrl}/painel/extrato?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicUrl}/painel/extrato?canceled=1`,
  });
  db.prepare("INSERT INTO payments (session_id, user_id, cents, currency, status, created_at) VALUES (?, ?, ?, 'usd', 'open', ?)")
    .run(s.id, user.id, cents, now());
  event(user.id, null, "payment.checkout_started", { amount_cents: cents });
  return s.url as string;
}

/** Confere o cabeçalho Stripe-Signature (t=…,v1=…) contra o corpo cru. */
export function verifyWebhook(raw: string, header: string | undefined, toleranceS = 300) {
  if (!header || !config.stripeWebhookSecret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]).filter((p) => p.length === 2)) as Record<string, string>;
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceS) return false;
  const expected = createHmac("sha256", config.stripeWebhookSecret).update(`${t}.${raw}`).digest();
  return header.split(",").filter((kv) => kv.startsWith("v1=")).some((kv) => {
    const got = Buffer.from(kv.slice(3), "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Aplica o evento. Idempotente: a mesma sessão nunca credita duas vezes. */
export function handleEvent(ev: any) {
  if (ev.type !== "checkout.session.completed" && ev.type !== "checkout.session.async_payment_succeeded") return "ignored";
  const s = ev.data?.object;
  if (!s || s.payment_status !== "paid") return "not paid";
  const userId = s.client_reference_id ?? s.metadata?.user_id;
  if (!userId || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) return "unknown user";
  const cents = Number(s.amount_total ?? 0);
  if ((s.currency ?? "usd") !== "usd" || cents <= 0) return "bad amount";
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT status FROM payments WHERE session_id = ?").get(s.id) as { status: string } | undefined;
    if (row?.status === "paid") { db.exec("ROLLBACK"); return "duplicate"; }
    if (row) db.prepare("UPDATE payments SET status = 'paid', paid_at = ?, cents = ? WHERE session_id = ?").run(now(), cents, s.id);
    else db.prepare("INSERT INTO payments (session_id, user_id, cents, currency, status, created_at, paid_at) VALUES (?, ?, ?, 'usd', 'paid', ?, ?)")
      .run(s.id, userId, cents, now(), now());
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  credit(userId, cents, `card top-up $${(cents / 100).toFixed(2)}`);
  event(userId, null, "payment.paid", { amount_cents: cents });
  return "credited";
}

export function paymentStatus(userId: string, sessionId: string) {
  return db.prepare("SELECT status, cents FROM payments WHERE session_id = ? AND user_id = ?").get(sessionId, userId) as
    { status: string; cents: number } | undefined;
}
