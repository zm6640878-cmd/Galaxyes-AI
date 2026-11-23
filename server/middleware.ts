import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import type { ApiKeyRow, ApiServiceId, KeyServiceScope, UserRow } from './db.ts';
import { hashToken } from './security.ts';

export interface AuthenticatedRequest extends Request {
  user?: UserRow;
  sessionTokenHash?: string;
  apiKeyRecord?: ApiKeyRow;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token || null;
  }
  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) {
    return xApiKey.trim();
  }
  return null;
}

export function requireUserAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as (UserRow & { expires_at: string }) | undefined;

  if (!row) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  if (row.status !== 'active') {
    res.status(403).json({ error: 'Account is suspended. Contact an administrator.' });
    return;
  }

  req.user = {
    id: row.id,
    email: row.email,
    name: row.name,
    password_hash: row.password_hash,
    role: row.role,
    plan: row.plan,
    status: row.status,
    daily_limit: Number(row.daily_limit),
    monthly_limit: Number(row.monthly_limit),
    created_at: row.created_at,
  };
  req.sessionTokenHash = tokenHash;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
}

export function requireApiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const rawKey = extractBearerToken(req);
  if (!rawKey || !rawKey.startsWith('glx_live_')) {
    res.status(401).json({
      error: {
        message: 'Invalid or missing Glaxyes API key. Provide Authorization: Bearer glx_live_...',
        type: 'authentication_error',
        code: 'invalid_api_key',
      },
    });
    return;
  }

  const keyHash = hashToken(rawKey);
  const keyRow = db
    .prepare(`SELECT * FROM api_keys WHERE key_hash = ?`)
    .get(keyHash) as unknown as ApiKeyRow | undefined;

  if (!keyRow || keyRow.status !== 'active') {
    res.status(401).json({
      error: {
        message: 'API key is invalid or has been revoked.',
        type: 'authentication_error',
        code: 'invalid_api_key',
      },
    });
    return;
  }

  const userRow = db
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .get(keyRow.user_id) as unknown as UserRow | undefined;

  if (!userRow || userRow.status !== 'active') {
    res.status(403).json({
      error: {
        message: 'Account associated with this API key is suspended.',
        type: 'permission_error',
        code: 'account_suspended',
      },
    });
    return;
  }

  req.apiKeyRecord = {
    ...keyRow,
    service_scope: (keyRow.service_scope || 'all') as KeyServiceScope,
    daily_limit: keyRow.daily_limit !== null ? Number(keyRow.daily_limit) : null,
    monthly_limit: keyRow.monthly_limit !== null ? Number(keyRow.monthly_limit) : null,
    total_requests: Number(keyRow.total_requests),
  };
  req.user = {
    ...userRow,
    daily_limit: Number(userRow.daily_limit),
    monthly_limit: Number(userRow.monthly_limit),
  };
  next();
}

export function assertKeyServiceScope(
  apiKey: ApiKeyRow,
  service: ApiServiceId,
  res: Response,
): boolean {
  if (apiKey.service_scope !== 'all' && apiKey.service_scope !== service) {
    res.status(403).json({
      error: {
        message: `This API key is scoped to the "${apiKey.service_scope}" API and cannot access the "${service}" API.`,
        type: 'permission_error',
        code: 'key_scope_mismatch',
      },
    });
    return false;
  }
  return true;
}
