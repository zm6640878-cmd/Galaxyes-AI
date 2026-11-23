import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  ALL_API_SERVICES,
  db,
  getCounterCount,
  getUserServiceQuota,
  getUtcDateKey,
  getUtcMonthKey,
} from '../db.ts';
import type { ApiKeyRow, ApiServiceId, KeyServiceScope } from '../db.ts';
import { requireUserAuth } from '../middleware.ts';
import type { AuthenticatedRequest } from '../middleware.ts';
import { generateApiKey } from '../security.ts';

const router = Router();
router.use(requireUserAuth);

const VALID_SCOPES = new Set<string>(['all', ...ALL_API_SERVICES]);

function serializeKey(row: ApiKeyRow) {
  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    service_scope: (row.service_scope || 'all') as KeyServiceScope,
    status: row.status,
    daily_limit: row.daily_limit !== null ? Number(row.daily_limit) : null,
    monthly_limit: row.monthly_limit !== null ? Number(row.monthly_limit) : null,
    total_requests: Number(row.total_requests),
    daily_used: getCounterCount(`key:${row.id}`, 'day', dayKey),
    monthly_used: getCounterCount(`key:${row.id}`, 'month', monthKey),
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  };
}

router.get('/', (req: AuthenticatedRequest, res) => {
  const serviceFilter = typeof req.query.service === 'string' ? req.query.service.trim() : '';
  let rows: ApiKeyRow[];

  if (serviceFilter && VALID_SCOPES.has(serviceFilter) && serviceFilter !== 'all') {
    rows = db
      .prepare(
        `SELECT * FROM api_keys
         WHERE user_id = ? AND (service_scope = ? OR service_scope = 'all')
         ORDER BY created_at DESC`,
      )
      .all(req.user!.id, serviceFilter) as unknown as ApiKeyRow[];
  } else {
    rows = db
      .prepare(`SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`)
      .all(req.user!.id) as unknown as ApiKeyRow[];
  }

  res.json({ keys: rows.map(serializeKey) });
});

router.post('/', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length < 2 || name.length > 64) {
    res.status(400).json({ error: 'Key name must be between 2 and 64 characters.' });
    return;
  }

  const rawScope =
    typeof req.body?.service_scope === 'string' ? req.body.service_scope.trim().toLowerCase() : 'all';
  if (!VALID_SCOPES.has(rawScope)) {
    res.status(400).json({
      error: `Invalid service_scope. Allowed: all, ${ALL_API_SERVICES.join(', ')}.`,
    });
    return;
  }
  const serviceScope = rawScope as KeyServiceScope;

  const countRow = db
    .prepare(`SELECT COUNT(*) AS count FROM api_keys WHERE user_id = ?`)
    .get(user.id) as { count: number };

  if (Number(countRow.count) >= 40) {
    res.status(400).json({ error: 'Maximum of 40 API keys per account reached.' });
    return;
  }

  const maxDaily =
    serviceScope === 'all'
      ? user.daily_limit
      : getUserServiceQuota(user.id, user.plan, serviceScope as ApiServiceId).daily_limit;
  const maxMonthly =
    serviceScope === 'all'
      ? user.monthly_limit
      : getUserServiceQuota(user.id, user.plan, serviceScope as ApiServiceId).monthly_limit;

  let dailyLimit: number | null = null;
  let monthlyLimit: number | null = null;

  if (req.body?.daily_limit !== undefined && req.body?.daily_limit !== null && req.body?.daily_limit !== '') {
    const parsed = Number(req.body.daily_limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxDaily) {
      res.status(400).json({
        error: `Custom daily limit must be an integer between 1 and ${maxDaily}.`,
      });
      return;
    }
    dailyLimit = parsed;
  }

  if (req.body?.monthly_limit !== undefined && req.body?.monthly_limit !== null && req.body?.monthly_limit !== '') {
    const parsed = Number(req.body.monthly_limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxMonthly) {
      res.status(400).json({
        error: `Custom monthly limit must be an integer between 1 and ${maxMonthly}.`,
      });
      return;
    }
    monthlyLimit = parsed;
  }

  const id = randomUUID();
  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, service_scope, status, daily_limit, monthly_limit, total_requests, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?)`,
  ).run(id, user.id, name, keyHash, keyPrefix, serviceScope, dailyLimit, monthlyLimit, now);

  const created = db.prepare(`SELECT * FROM api_keys WHERE id = ?`).get(id) as unknown as ApiKeyRow;

  res.status(201).json({
    key: serializeKey(created),
    rawKey,
  });
});

router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const existing = db
    .prepare(`SELECT * FROM api_keys WHERE id = ? AND user_id = ?`)
    .get(req.params.id, user.id) as unknown as ApiKeyRow | undefined;

  if (!existing) {
    res.status(404).json({ error: 'API key not found.' });
    return;
  }

  const nextName =
    typeof req.body?.name === 'string' && req.body.name.trim().length >= 2
      ? req.body.name.trim().slice(0, 64)
      : existing.name;

  const nextStatus =
    req.body?.status === 'active' || req.body?.status === 'revoked'
      ? req.body.status
      : existing.status;

  db.prepare(`UPDATE api_keys SET name = ?, status = ? WHERE id = ? AND user_id = ?`).run(
    nextName,
    nextStatus,
    existing.id,
    user.id,
  );

  const updated = db.prepare(`SELECT * FROM api_keys WHERE id = ?`).get(existing.id) as unknown as ApiKeyRow;
  res.json({ key: serializeKey(updated) });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const result = db
    .prepare(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`)
    .run(req.params.id, user.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'API key not found.' });
    return;
  }

  res.json({ ok: true });
});

export default router;
