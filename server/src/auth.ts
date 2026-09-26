import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { db, now } from "./db.ts";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomId = (prefix: string, bytes = 9) => prefix + randomBytes(bytes).toString("base64url");

export function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const h = scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}

export function checkPassword(pw: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  const h = scryptSync(pw, Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(h, Buffer.from(hash, "hex"));
}

export const SESSION_COOKIE = "wisp_session";
const SESSION_DAYS = 30;

export function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(token), userId, now(), now() + SESSION_DAYS * 86400_000);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function createApiToken(userId: string, label: string) {
  const raw = "wsp_" + randomBytes(24).toString("base64url");
  const id = randomId("tok_");
  db.prepare("INSERT INTO api_tokens (id, user_id, token_hash, prefix, label, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, sha256(raw), raw.slice(0, 10), label.slice(0, 80), now());
  return { id, raw };
}

export type User = { id: string; email: string; name: string; credit_cents: number; is_admin: number };
export type AuthVars = { user: User; tokenId: string | null; via: "session" | "token" };

/** Aceita cookie de sessão (painel) ou Bearer wsp_… (MCP). Mutação por cookie exige o cabeçalho X-Wisp (CSRF). */
export async function requireUser(c: Context<{ Variables: AuthVars }>, next: Next) {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer wsp_")) {
    const raw = auth.slice(7);
    const row = db.prepare(`SELECT t.id AS token_id, u.id, u.email, u.name, u.credit_cents, u.is_admin
      FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.revoked_at IS NULL`)
      .get(sha256(raw)) as (User & { token_id: string }) | undefined;
    if (!row) return c.json({ error: "token inválido ou revogado" }, 401);
    db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(now(), row.token_id);
    const { token_id, ...user } = row;
    c.set("user", user); c.set("tokenId", token_id); c.set("via", "token");
    return next();
  }
  const cookie = getCookie(c, SESSION_COOKIE);
  if (cookie) {
    const user = db.prepare(`SELECT u.id, u.email, u.name, u.credit_cents, u.is_admin FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
      .get(sha256(cookie), now()) as User | undefined;
    if (user) {
      if (c.req.method !== "GET" && c.req.header("x-wisp") !== "1") return c.json({ error: "csrf" }, 403);
      c.set("user", user); c.set("tokenId", null); c.set("via", "session");
      return next();
    }
  }
  return c.json({ error: "não autenticado" }, 401);
}
