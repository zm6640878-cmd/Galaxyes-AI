import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  db,
  getCounterCount,
  getUtcDateKey,
  getUtcMonthKey,
  PLAN_DEFAULTS,
} from '../db.ts';
import type { UserRow } from '../db.ts';
import { requireUserAuth } from '../middleware.ts';
import type { AuthenticatedRequest } from '../middleware.ts';
import {
  checkAuthRateLimit,
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyConstantTimeSecret,
  verifyPassword,
} from '../security.ts';

const router = Router();

function serializeUser(user: UserRow) {
  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    status: user.status,
    daily_limit: Number(user.daily_limit),
    monthly_limit: Number(user.monthly_limit),
    daily_used: getCounterCount(`user:${user.id}`, 'day', dayKey),
    monthly_used: getCounterCount(`user:${user.id}`, 'month', monthKey),
    created_at: user.created_at,
  };
}

function createSession(userId: string): string {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
  ).run(tokenHash, userId, expiresAt, now.toISOString());

  return token;
}

router.get('/bootstrap-status', (_req, res) => {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
    .get() as { count: number };
  res.json({
    adminExists: Number(row.count) > 0,
    envPasscodeConfigured: Boolean(process.env.ADMIN_PASSCODE?.trim()),
  });
});

router.post('/claim-admin', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkAuthRateLimit(ip, 15, 60_000)) {
    res.status(429).json({ error: 'Too many authentication attempts. Please wait a minute.' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';

  if (!name || name.length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters.' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  if (envPasscode && !verifyConstantTimeSecret(passcode, envPasscode)) {
    res.status(403).json({ error: 'Invalid server admin passcode.' });
    return;
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  try {
    db.exec('BEGIN IMMEDIATE');
    const adminCheck = db
      .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
      .get() as { count: number };

    if (Number(adminCheck.count) > 0) {
      db.exec('ROLLBACK');
      res.status(409).json({ error: 'An administrator account has already been claimed.' });
      return;
    }

    const emailCheck = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (emailCheck) {
      db.exec('ROLLBACK');
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, plan, status, daily_limit, monthly_limit, created_at)
       VALUES (?, ?, ?, ?, 'admin', 'enterprise', 'active', ?, ?, ?)`,
    ).run(
      userId,
      email,
      name,
      passwordHash,
      PLAN_DEFAULTS.enterprise.daily_limit,
      PLAN_DEFAULTS.enterprise.monthly_limit,
      now,
    );
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    const message = err instanceof Error ? err.message : 'Failed to create admin account.';
    res.status(500).json({ error: message });
    return;
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as unknown as UserRow;
  const token = createSession(userId);
  res.status(201).json({ token, user: serializeUser(user) });
});

router.post('/register', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkAuthRateLimit(ip, 20, 60_000)) {
    res.status(429).json({ error: 'Too many registration attempts. Please wait a minute.' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!name || name.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, plan, status, daily_limit, monthly_limit, created_at)
     VALUES (?, ?, ?, ?, 'developer', 'starter', 'active', ?, ?, ?)`,
  ).run(
    userId,
    email,
    name,
    passwordHash,
    PLAN_DEFAULTS.starter.daily_limit,
    PLAN_DEFAULTS.starter.monthly_limit,
    now,
  );

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as unknown as UserRow;
  const token = createSession(userId);
  res.status(201).json({ token, user: serializeUser(user) });
});

router.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!checkAuthRateLimit(ip, 25, 60_000)) {
    res.status(429).json({ error: 'Too many sign-in attempts. Please wait a minute.' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as UserRow | undefined;
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const passwordOk =
    verifyPassword(password, user.password_hash) ||
    (user.role === 'admin' && Boolean(envPasscode) && verifyConstantTimeSecret(password, envPasscode!));

  if (!passwordOk) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.status !== 'active') {
    res.status(403).json({ error: 'This account is suspended. Contact an administrator.' });
    return;
  }

  const token = createSession(user.id);
  res.json({ token, user: serializeUser(user) });
});

router.post('/logout', requireUserAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionTokenHash) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(req.sessionTokenHash);
  }
  res.json({ ok: true });
});

router.get('/me', requireUserAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: serializeUser(req.user!) });
});

export default router;
