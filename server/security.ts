import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  const expectedBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = scryptSync(password, salt, 64);

  if (expectedBuffer.length !== derivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, derivedBuffer);
}

export function verifyConstantTimeSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Perform dummy compare to avoid length leak timing differences
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return `glx_sess_${randomBytes(32).toString('base64url')}`;
}

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const secretPart = randomBytes(24).toString('base64url');
  const rawKey = `glx_live_${secretPart}`;
  const keyHash = hashToken(rawKey);
  const keyPrefix = `${rawKey.slice(0, 15)}...${rawKey.slice(-4)}`;
  return { rawKey, keyHash, keyPrefix };
}

// In-memory sliding-window limiter for auth endpoints (brute-force protection)
const authAttempts = new Map<string, number[]>();

export function checkAuthRateLimit(ip: string, maxAttempts = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const existing = (authAttempts.get(ip) ?? []).filter((ts) => ts > cutoff);
  if (existing.length >= maxAttempts) {
    authAttempts.set(ip, existing);
    return false;
  }
  existing.push(now);
  authAttempts.set(ip, existing);
  return true;
}
