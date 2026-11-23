import { Router } from 'express';
import {
  ALL_API_SERVICES,
  db,
  getCounterCount,
  getUserServiceQuota,
  getUtcDateKey,
  getUtcMonthKey,
} from '../db.ts';
import type { ApiServiceId } from '../db.ts';
import { requireUserAuth } from '../middleware.ts';
import type { AuthenticatedRequest } from '../middleware.ts';

const router = Router();
router.use(requireUserAuth);

router.get('/summary', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();

  const dailyUsed = getCounterCount(`user:${user.id}`, 'day', dayKey);
  const monthlyUsed = getCounterCount(`user:${user.id}`, 'month', monthKey);

  const aggregates = db
    .prepare(
      `SELECT
         COUNT(*) AS total_requests,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
         COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
         COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS error_count
       FROM usage_logs
       WHERE user_id = ?`,
    )
    .get(user.id) as {
      total_requests: number;
      total_tokens: number;
      prompt_tokens: number;
      completion_tokens: number;
      avg_latency_ms: number;
      error_count: number;
    };

  const dailySeriesRows = db
    .prepare(
      `SELECT
         substr(created_at, 1, 10) AS date,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS tokens,
         COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS errors
       FROM usage_logs
       WHERE user_id = ? AND created_at >= ?
       GROUP BY substr(created_at, 1, 10)
       ORDER BY date ASC`,
    )
    .all(
      user.id,
      new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ) as Array<{ date: string; requests: number; tokens: number; errors: number }>;

  const seriesMap = new Map<string, { requests: number; tokens: number; errors: number }>();
  for (const r of dailySeriesRows) {
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

  const byModel = db
    .prepare(
      `SELECT
         model,
         COUNT(*) AS requests,
         COALESCE(SUM(total_tokens), 0) AS tokens,
         COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
       FROM usage_logs
       WHERE user_id = ?
       GROUP BY model
       ORDER BY requests DESC`,
    )
    .all(user.id) as Array<{
      model: string;
      requests: number;
      tokens: number;
      avg_latency_ms: number;
    }>;

  const serviceLogRows = db
    .prepare(
      `SELECT
         service,
         COUNT(*) AS total_requests,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
         COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS error_count
       FROM usage_logs
       WHERE user_id = ?
       GROUP BY service`,
    )
    .all(user.id) as Array<{
      service: ApiServiceId;
      total_requests: number;
      total_tokens: number;
      avg_latency_ms: number;
      error_count: number;
    }>;

  const serviceMap = new Map(serviceLogRows.map((r) => [r.service, r]));
  const byService = ALL_API_SERVICES.map((service) => {
    const quota = getUserServiceQuota(user.id, user.plan, service);
    const effectiveDailyLimit =
      service === 'chat' ? Math.min(user.daily_limit, quota.daily_limit) : quota.daily_limit;
    const effectiveMonthlyLimit =
      service === 'chat' ? Math.min(user.monthly_limit, quota.monthly_limit) : quota.monthly_limit;

    const svcDailyUsed = getCounterCount(`svc:${user.id}:${service}`, 'day', dayKey);
    const svcMonthlyUsed = getCounterCount(`svc:${user.id}:${service}`, 'month', monthKey);
    const agg = serviceMap.get(service);

    return {
      service,
      daily_used: svcDailyUsed,
      daily_limit: effectiveDailyLimit,
      daily_remaining: Math.max(0, effectiveDailyLimit - svcDailyUsed),
      monthly_used: svcMonthlyUsed,
      monthly_limit: effectiveMonthlyLimit,
      monthly_remaining: Math.max(0, effectiveMonthlyLimit - svcMonthlyUsed),
      total_requests: agg ? Number(agg.total_requests) : 0,
      total_tokens: agg ? Number(agg.total_tokens) : 0,
      avg_latency_ms: agg ? Math.round(Number(agg.avg_latency_ms)) : 0,
      error_count: agg ? Number(agg.error_count) : 0,
    };
  });

  res.json({
    quotas: {
      daily_limit: user.daily_limit,
      daily_used: dailyUsed,
      daily_remaining: Math.max(0, user.daily_limit - dailyUsed),
      monthly_limit: user.monthly_limit,
      monthly_used: monthlyUsed,
      monthly_remaining: Math.max(0, user.monthly_limit - monthlyUsed),
      utc_date: dayKey,
      utc_month: monthKey,
    },
    totals: {
      total_requests: Number(aggregates.total_requests),
      total_tokens: Number(aggregates.total_tokens),
      prompt_tokens: Number(aggregates.prompt_tokens),
      completion_tokens: Number(aggregates.completion_tokens),
      avg_latency_ms: Math.round(Number(aggregates.avg_latency_ms)),
      error_count: Number(aggregates.error_count),
    },
    dailySeries,
    byModel: byModel.map((m) => ({
      model: m.model,
      requests: Number(m.requests),
      tokens: Number(m.tokens),
      avg_latency_ms: Math.round(Number(m.avg_latency_ms)),
    })),
    byService,
  });
});

router.get('/logs', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const modelFilter = typeof req.query.model === 'string' ? req.query.model.trim() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const keyIdFilter = typeof req.query.api_key_id === 'string' ? req.query.api_key_id.trim() : '';
  const serviceFilter = typeof req.query.service === 'string' ? req.query.service.trim() : '';

  const conditions: string[] = ['l.user_id = ?'];
  const params: Array<string | number> = [user.id];

  if (serviceFilter && ALL_API_SERVICES.includes(serviceFilter as ApiServiceId)) {
    conditions.push('l.service = ?');
    params.push(serviceFilter);
  }
  if (modelFilter) {
    conditions.push('l.model = ?');
    params.push(modelFilter);
  }
  if (keyIdFilter) {
    conditions.push('l.api_key_id = ?');
    params.push(keyIdFilter);
  }
  if (statusFilter === 'ok') {
    conditions.push('l.status_code < 400');
  } else if (statusFilter === 'error') {
    conditions.push('l.status_code >= 400');
  }

  params.push(limit);

  const logs = db
    .prepare(
      `SELECT
         l.id,
         l.service,
         l.api_key_id,
         k.name AS key_name,
         k.key_prefix,
         l.model,
         l.requested_model,
         l.prompt_tokens,
         l.completion_tokens,
         l.total_tokens,
         l.latency_ms,
         l.status_code,
         l.stream,
         l.error_message,
         l.created_at
       FROM usage_logs l
       LEFT JOIN api_keys k ON k.id = l.api_key_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT ?`,
    )
    .all(...params);

  res.json({ logs });
});

export default router;
