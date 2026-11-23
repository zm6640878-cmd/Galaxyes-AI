import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type ApiServiceId = 'chat' | 'image' | 'video' | 'coding' | 'voice' | 'vision';
export type KeyServiceScope = 'all' | ApiServiceId;

export const ALL_API_SERVICES: ApiServiceId[] = [
  'chat',
  'image',
  'video',
  'coding',
  'voice',
  'vision',
];

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'developer' | 'admin';
  plan: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
  daily_limit: number;
  monthly_limit: number;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  service_scope: KeyServiceScope;
  status: 'active' | 'revoked';
  daily_limit: number | null;
  monthly_limit: number | null;
  total_requests: number;
  last_used_at: string | null;
  created_at: string;
}

const resolvedDbPath = process.env.DATABASE_PATH?.trim()
  ? path.resolve(process.env.DATABASE_PATH.trim())
  : path.join(process.cwd(), 'data', 'glaxyes.db');

fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

export const db = new DatabaseSync(resolvedDbPath);

function columnExists(tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === columnName);
}

export function initDb(): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('developer', 'admin')),
      plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      daily_limit INTEGER NOT NULL DEFAULT 100,
      monthly_limit INTEGER NOT NULL DEFAULT 2000,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      service_scope TEXT NOT NULL DEFAULT 'all',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
      daily_limit INTEGER,
      monthly_limit INTEGER,
      total_requests INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_counters (
      scope_id TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK (period_type IN ('day', 'month')),
      period_key TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      token_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scope_id, period_type, period_key)
    );

    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      service TEXT NOT NULL DEFAULT 'chat',
      model TEXT NOT NULL,
      requested_model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      status_code INTEGER NOT NULL,
      stream INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_service_quotas (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service TEXT NOT NULL CHECK (service IN ('chat', 'image', 'video', 'coding', 'voice', 'vision')),
      daily_limit INTEGER NOT NULL,
      monthly_limit INTEGER NOT NULL,
      PRIMARY KEY (user_id, service)
    );

    CREATE TABLE IF NOT EXISTS generated_media (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service TEXT NOT NULL CHECK (service IN ('image', 'video')),
      model TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      access_token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      model TEXT NOT NULL,
      requested_model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'text_to_video',
      aspect_ratio TEXT NOT NULL DEFAULT '16:9',
      duration TEXT NOT NULL DEFAULT '5s',
      resolution TEXT NOT NULL DEFAULT '720p',
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
      interaction_id TEXT,
      media_id TEXT REFERENCES generated_media(id) ON DELETE SET NULL,
      video_url TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      error_message TEXT,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_service_health (
      service TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('active', 'error', 'untested')),
      tested_model TEXT,
      last_error TEXT,
      last_tested_at TEXT NOT NULL
    );
  `);

  // Safe non-destructive migrations for existing databases
  if (!columnExists('api_keys', 'service_scope')) {
    db.exec(`ALTER TABLE api_keys ADD COLUMN service_scope TEXT NOT NULL DEFAULT 'all';`);
  }
  if (!columnExists('usage_logs', 'service')) {
    db.exec(`ALTER TABLE usage_logs ADD COLUMN service TEXT NOT NULL DEFAULT 'chat';`);
  }

  // Seed initial service health states (Image & Video stay 'untested' until a real generation succeeds)
  const now = new Date().toISOString();
  const seedHealth = db.prepare(
    `INSERT OR IGNORE INTO api_service_health (service, status, tested_model, last_error, last_tested_at)
     VALUES (?, ?, ?, NULL, ?)`,
  );
  seedHealth.run('chat', 'active', 'gemini-3.1-flash-lite', now);
  seedHealth.run('coding', 'active', 'gemini-3.1-flash-lite', now);
  seedHealth.run('voice', 'active', 'gemini-3.8-flash-lite-tts', now);
  seedHealth.run('vision', 'active', 'gemini-3.1-flash-lite', now);
  seedHealth.run('image', 'untested', 'gemini-3.1-flash-lite-image', now);
  seedHealth.run('video', 'untested', 'gemini-omni-1.2-flash', now);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_user_service ON usage_logs(user_id, service, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_video_jobs_user_created ON video_jobs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_media_user ON generated_media(user_id, created_at DESC);
  `);
}

export type ServiceHealthStatus = 'active' | 'error' | 'untested';

export interface ServiceHealthRecord {
  service: ApiServiceId;
  status: ServiceHealthStatus;
  tested_model: string | null;
  last_error: string | null;
  last_tested_at: string;
}

export function setServiceHealth(
  service: ApiServiceId,
  status: ServiceHealthStatus,
  testedModel: string | null,
  lastError: string | null = null,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO api_service_health (service, status, tested_model, last_error, last_tested_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(service) DO UPDATE SET
       status = excluded.status,
       tested_model = excluded.tested_model,
       last_error = excluded.last_error,
       last_tested_at = excluded.last_tested_at`,
  ).run(service, status, testedModel, lastError, now);
}

export function getServiceHealthMap(): Map<ApiServiceId, ServiceHealthRecord> {
  const rows = db
    .prepare(`SELECT * FROM api_service_health`)
    .all() as unknown as ServiceHealthRecord[];
  return new Map(rows.map((r) => [r.service, r]));
}

export function getUtcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcMonthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function getCounterCount(
  scopeId: string,
  periodType: 'day' | 'month',
  periodKey: string,
): number {
  const row = db
    .prepare(
      `SELECT request_count FROM usage_counters WHERE scope_id = ? AND period_type = ? AND period_key = ?`,
    )
    .get(scopeId, periodType, periodKey) as { request_count: number } | undefined;
  return row ? Number(row.request_count) : 0;
}

export function incrementCounterRequests(
  scopeId: string,
  periodType: 'day' | 'month',
  periodKey: string,
): number {
  db.prepare(
    `INSERT INTO usage_counters (scope_id, period_type, period_key, request_count, token_count)
     VALUES (?, ?, ?, 1, 0)
     ON CONFLICT(scope_id, period_type, period_key)
     DO UPDATE SET request_count = request_count + 1`,
  ).run(scopeId, periodType, periodKey);

  return getCounterCount(scopeId, periodType, periodKey);
}

export function addCounterTokens(
  scopeId: string,
  periodType: 'day' | 'month',
  periodKey: string,
  tokens: number,
): void {
  if (tokens <= 0) return;
  db.prepare(
    `INSERT INTO usage_counters (scope_id, period_type, period_key, request_count, token_count)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(scope_id, period_type, period_key)
     DO UPDATE SET token_count = token_count + ?`,
  ).run(scopeId, periodType, periodKey, tokens, tokens);
}

export const PLAN_DEFAULTS = {
  starter: { daily_limit: 100, monthly_limit: 2000 },
  pro: { daily_limit: 1000, monthly_limit: 25000 },
  enterprise: { daily_limit: 10000, monthly_limit: 250000 },
} as const;

export const SERVICE_PLAN_QUOTAS: Record<
  'starter' | 'pro' | 'enterprise',
  Record<ApiServiceId, { daily_limit: number; monthly_limit: number }>
> = {
  starter: {
    chat: { daily_limit: 100, monthly_limit: 2000 },
    coding: { daily_limit: 75, monthly_limit: 1500 },
    voice: { daily_limit: 40, monthly_limit: 600 },
    vision: { daily_limit: 50, monthly_limit: 1000 },
    image: { daily_limit: 20, monthly_limit: 300 },
    video: { daily_limit: 5, monthly_limit: 50 },
  },
  pro: {
    chat: { daily_limit: 1000, monthly_limit: 25000 },
    coding: { daily_limit: 800, monthly_limit: 20000 },
    voice: { daily_limit: 400, monthly_limit: 8000 },
    vision: { daily_limit: 500, monthly_limit: 12000 },
    image: { daily_limit: 250, monthly_limit: 5000 },
    video: { daily_limit: 50, monthly_limit: 600 },
  },
  enterprise: {
    chat: { daily_limit: 10000, monthly_limit: 250000 },
    coding: { daily_limit: 8000, monthly_limit: 200000 },
    voice: { daily_limit: 4000, monthly_limit: 80000 },
    vision: { daily_limit: 5000, monthly_limit: 120000 },
    image: { daily_limit: 2500, monthly_limit: 50000 },
    video: { daily_limit: 500, monthly_limit: 6000 },
  },
};

export function getUserServiceQuota(
  userId: string,
  plan: 'starter' | 'pro' | 'enterprise',
  service: ApiServiceId,
): { daily_limit: number; monthly_limit: number } {
  const custom = db
    .prepare(`SELECT daily_limit, monthly_limit FROM user_service_quotas WHERE user_id = ? AND service = ?`)
    .get(userId, service) as { daily_limit: number; monthly_limit: number } | undefined;

  if (custom) {
    return {
      daily_limit: Number(custom.daily_limit),
      monthly_limit: Number(custom.monthly_limit),
    };
  }
  return SERVICE_PLAN_QUOTAS[plan][service];
}
