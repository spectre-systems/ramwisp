import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.ts";

mkdirSync(dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  credit_cents REAL NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS device_codes (
  device_hash TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_id TEXT,
  token TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_id TEXT,
  label TEXT,
  engine TEXT NOT NULL,
  ram_gb INTEGER NOT NULL,
  timeout_s INTEGER NOT NULL,
  status TEXT NOT NULL,
  instance_type TEXT,
  instance_id TEXT,
  enclave_mem_mib INTEGER,
  enclave_cpus INTEGER,
  rate_cents_h REAL,
  hold_cents REAL NOT NULL DEFAULT 0,
  cost_cents REAL,
  nonce TEXT NOT NULL,
  job_token_hash TEXT NOT NULL UNIQUE,
  attestation TEXT,
  input_sealed TEXT,
  output_sealed TEXT,
  meta TEXT,
  egress TEXT,
  mem_used_mib INTEGER,
  mem_total_mib INTEGER,
  peak_mem_mib INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  launched_at INTEGER,
  attested_at INTEGER,
  started_at INTEGER,
  finished_at INTEGER,
  collected_at INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  job_id TEXT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS events_user ON events(user_id, at);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  job_id TEXT,
  at INTEGER NOT NULL,
  cents REAL NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

export const now = () => Date.now();

export function event(userId: string, jobId: string | null, kind: string, detail?: unknown) {
  db.prepare("INSERT INTO events (user_id, job_id, at, kind, detail) VALUES (?, ?, ?, ?, ?)")
    .run(userId, jobId, now(), kind, detail === undefined ? null : JSON.stringify(detail));
}

/** Mexe no saldo e registra no extrato, na mesma transação. */
export function credit(userId: string, cents: number, reason: string, jobId: string | null = null) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET credit_cents = credit_cents + ? WHERE id = ?").run(cents, userId);
    db.prepare("INSERT INTO ledger (user_id, job_id, at, cents, reason) VALUES (?, ?, ?, ?, ?)")
      .run(userId, jobId, now(), cents, reason);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function kvGet(k: string): string | undefined {
  const r = db.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined;
  return r?.v;
}

export function kvSet(k: string, v: string) {
  db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);
}
