import { Router } from 'express';
import {
  ALL_API_SERVICES,
  db,
  getCounterCount,
  getUserServiceQuota,
  getUtcDateKey,
  getUtcMonthKey,
  PLAN_DEFAULTS,
  SERVICE_PLAN_QUOTAS,
} from '../db.ts';
import type { ApiServiceId, UserRow } from '../db.ts';
import { requireAdmin, requireUserAuth } from '../middleware.ts';
import type { AuthenticatedRequest } from '../middleware.ts';

const router = Router();
router.use(requireUserAuth);
router.use(requireAdmin);

router.get('/overview', (_req, res) => {
  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();

  const userCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS total_users,
         COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_users
       FROM users`,
    )
    .get() as { total_users: number; active_users: number };

  const keyCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS total_keys,
         COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_keys
       FROM api_keys`,
    )
    .get() as { total_keys: number; active_keys: number };

  const todayStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(request_count), 0) AS requests_today,
         COALESCE(SUM(token_count), 0) AS tokens_today
       FROM usage_counters
       WHERE scope_id LIKE 'user:%' AND period_type = 'day' AND period_key = ?`,
    )
    .get(dayKey) as { requests_today: number; tokens_today: number };

  const monthStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(request_count), 0) AS requests_month,
         COALESCE(SUM(token_count), 0) AS tokens_month
       FROM usage_counters
       WHERE scope_id LIKE 'user:%' AND period_type = 'month' AND period_key = ?`,
    )
    .get(monthKey) as { requests_month: number; tokens_month: number };

  const logTotals = db
    .prepare(
      `SELECT
         COUNT(*) AS total_requests,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
         COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS error_count
       FROM usage_logs`,
    )
    .get() as {
      total_requests: number;
      total_tokens: number;
      avg_latency_ms: number;
      error_count: number;
    };

  const dailyRows = db
    .prepare(
      `SELECT
         substr(created_at, 1, 10) AS date,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS tokens,
         COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS errors
       FROM usage_logs
       WHERE created_at >= ?
       GROUP BY substr(created_at, 1, 10)
       ORDER BY date ASC`,
    )
    .all(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)) as Array<{
      date: string;
      requests: number;
      tokens: number;
      errors: number;
    }>;

  const seriesMap = new Map<string, { requests: number; tokens: number; errors: number }>();
  for (const r of dailyRows) {
    seriesMap.set(r.date, {
      requests: Number(r.requests),
      tokens: Number(r.tokens),
      errors: Number(r.errors),
    });
  }

  const dailySeries: Array<{ date: string; requests: number; tokens: number; errors: number }> = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const point = seriesMap.get(d) ?? { requests: 0, tokens: 0, errors: 0 };
    dailySeries.push({ date: d, ...point });
  }

  const serviceAggRows = db
    .prepare(
      `SELECT
         service,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS tokens,
         COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
       FROM usage_logs
       GROUP BY service`,
    )
    .all() as Array<{
      service: ApiServiceId;
      requests: number;
      tokens: number;
      avg_latency_ms: number;
    }>;

  const serviceAggMap = new Map(serviceAggRows.map((r) => [r.service, r]));
  const byService = ALL_API_SERVICES.map((svc) => {
    const row = serviceAggMap.get(svc);
    return {
      service: svc,
      requests: row ? Number(row.requests) : 0,
      tokens: row ? Number(row.tokens) : 0,
      avg_latency_ms: row ? Math.round(Number(row.avg_latency_ms)) : 0,
    };
  });

  res.json({
    metrics: {
      total_users: Number(userCounts.total_users),
      active_users: Number(userCounts.active_users),
      total_keys: Number(keyCounts.total_keys),
      active_keys: Number(keyCounts.active_keys),
      requests_today: Number(todayStats.requests_today),
      requests_month: Number(monthStats.requests_month),
      total_requests: Number(logTotals.total_requests),
      total_tokens: Number(logTotals.total_tokens),
      avg_latency_ms: Math.round(Number(logTotals.avg_latency_ms)),
      error_count: Number(logTotals.error_count),
    },
    dailySeries,
    byService,
  });
});

router.get('/users', (_req, res) => {
  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();

  const users = db
    .prepare(
      `SELECT
         u.*,
         (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id AND k.status = 'active') AS active_keys,
         (SELECT COALESCE(SUM(total_tokens), 0) FROM usage_logs l WHERE l.user_id = u.id) AS total_tokens
       FROM users u
       ORDER BY u.created_at DESC`,
    )
    .all() as unknown as Array<UserRow & { active_keys: number; total_tokens: number }>;

  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      plan: u.plan,
      status: u.status,
      daily_limit: Number(u.daily_limit),
      monthly_limit: Number(u.monthly_limit),
      daily_used: getCounterCount(`user:${u.id}`, 'day', dayKey),
      monthly_used: getCounterCount(`user:${u.id}`, 'month', monthKey),
      active_keys: Number(u.active_keys),
      total_tokens: Number(u.total_tokens),
      created_at: u.created_at,
    })),
  });
});

router.get('/users/:id/service-quotas', (req, res) => {
  const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as
    | (UserRow | undefined);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();

  const quotas = ALL_API_SERVICES.map((service) => {
    const q = getUserServiceQuota(target.id, target.plan, service);
    return {
      service,
      daily_limit: q.daily_limit,
      monthly_limit: q.monthly_limit,
      daily_used: getCounterCount(`svc:${target.id}:${service}`, 'day', dayKey),
      monthly_used: getCounterCount(`svc:${target.id}:${service}`, 'month', monthKey),
    };
  });

  res.json({ quotas });
});

router.put('/users/:id/service-quotas', (req, res) => {
  const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id) as
    | (UserRow | undefined);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const incoming = req.body?.quotas;
  if (!Array.isArray(incoming)) {
    res.status(400).json({ error: 'Field "quotas" must be an array.' });
    return;
  }

  for (const item of incoming) {
    if (!item || !ALL_API_SERVICES.includes(item.service)) {
      res.status(400).json({ error: 'Invalid service in quotas array.' });
      return;
    }
    const daily = Number(item.daily_limit);
    const monthly = Number(item.monthly_limit);
    if (!Number.isInteger(daily) || daily < 0 || !Number.isInteger(monthly) || monthly < 0) {
      res.status(400).json({ error: 'Quota limits must be non-negative integers.' });
      return;
    }

    db.prepare(
      `INSERT INTO user_service_quotas (user_id, service, daily_limit, monthly_limit)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, service)
       DO UPDATE SET daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit`,
    ).run(target.id, item.service, daily, monthly);
  }

  res.json({ ok: true });
});

router.patch('/users/:id', (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId) as
    | (UserRow | undefined);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  let nextPlan = target.plan;
  let nextDaily = Number(target.daily_limit);
  let nextMonthly = Number(target.monthly_limit);
  let nextStatus = target.status;
  let nextRole = target.role;

  if (req.body?.plan === 'starter' || req.body?.plan === 'pro' || req.body?.plan === 'enterprise') {
    nextPlan = req.body.plan;
    if (req.body?.daily_limit === undefined && req.body?.monthly_limit === undefined) {
      nextDaily = PLAN_DEFAULTS[nextPlan].daily_limit;
      nextMonthly = PLAN_DEFAULTS[nextPlan].monthly_limit;
    }
    for (const svc of ALL_API_SERVICES) {
      const def = SERVICE_PLAN_QUOTAS[nextPlan][svc];
      db.prepare(
        `INSERT INTO user_service_quotas (user_id, service, daily_limit, monthly_limit)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, service)
         DO UPDATE SET daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit`,
      ).run(target.id, svc, def.daily_limit, def.monthly_limit);
    }
  }

  if (req.body?.daily_limit !== undefined) {
    const parsed = Number(req.body.daily_limit);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000_000) {
      res.status(400).json({ error: 'daily_limit must be an integer between 0 and 10,000,000.' });
      return;
    }
    nextDaily = parsed;
  }

  if (req.body?.monthly_limit !== undefined) {
    const parsed = Number(req.body.monthly_limit);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000_000) {
      res.status(400).json({ error: 'monthly_limit must be an integer between 0 and 100,000,000.' });
      return;
    }
    nextMonthly = parsed;
  }

  if (req.body?.status === 'active' || req.body?.status === 'suspended') {
    if (target.id === req.user!.id && req.body.status === 'suspended') {
      res.status(400).json({ error: 'You cannot suspend your own administrator account.' });
      return;
    }
    nextStatus = req.body.status;
  }

  if (req.body?.role === 'developer' || req.body?.role === 'admin') {
    if (target.id === req.user!.id && req.body.role !== 'admin') {
      res.status(400).json({ error: 'You cannot remove your own administrator role.' });
      return;
    }
    nextRole = req.body.role;
  }

  db.prepare(
    `UPDATE users SET plan = ?, daily_limit = ?, monthly_limit = ?, status = ?, role = ? WHERE id = ?`,
  ).run(nextPlan, nextDaily, nextMonthly, nextStatus, nextRole, target.id);

  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(target.id) as unknown as UserRow;
  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();

  res.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      plan: updated.plan,
      status: updated.status,
      daily_limit: Number(updated.daily_limit),
      monthly_limit: Number(updated.monthly_limit),
      daily_used: getCounterCount(`user:${updated.id}`, 'day', dayKey),
      monthly_used: getCounterCount(`user:${updated.id}`, 'month', monthKey),
      created_at: updated.created_at,
    },
  });
});

router.get('/keys', (_req, res) => {
  const keys = db
    .prepare(
      `SELECT
         k.id, k.user_id, k.name, k.key_prefix, k.service_scope, k.status,
         k.daily_limit, k.monthly_limit, k.total_requests, k.last_used_at, k.created_at,
         u.email AS owner_email, u.name AS owner_name
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       ORDER BY k.created_at DESC
       LIMIT 200`,
    )
    .all();

  res.json({ keys });
});

router.patch('/keys/:id/revoke', (req, res) => {
  const existing = db.prepare(`SELECT id, status FROM api_keys WHERE id = ?`).get(req.params.id) as
    | { id: string; status: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'API key not found.' });
    return;
  }
  const nextStatus = req.body?.status === 'active' ? 'active' : 'revoked';
  db.prepare(`UPDATE api_keys SET status = ? WHERE id = ?`).run(nextStatus, existing.id);
  res.json({ ok: true, status: nextStatus });
});

router.get('/logs', (req, res) => {
  const limit = Math.min(150, Math.max(1, Number(req.query.limit) || 60));
  const logs = db
    .prepare(
      `SELECT
         l.id, l.service, l.user_id, u.email AS user_email,
         l.api_key_id, k.key_prefix,
         l.model, l.requested_model,
         l.prompt_tokens, l.completion_tokens, l.total_tokens,
         l.latency_ms, l.status_code, l.stream, l.error_message, l.created_at
       FROM usage_logs l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN api_keys k ON k.id = l.api_key_id
       ORDER BY l.created_at DESC
       LIMIT ?`,
    )
    .all(limit);

  res.json({ logs });
});

export default router;
