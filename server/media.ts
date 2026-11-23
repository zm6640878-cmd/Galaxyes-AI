import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.ts';
import { hashToken, verifyConstantTimeSecret } from './security.ts';

export type MediaServiceType = 'image' | 'video';

export interface GeneratedMediaRow {
  id: string;
  user_id: string;
  service: MediaServiceType;
  model: string;
  mime_type: string;
  filename: string;
  size_bytes: number;
  access_token_hash: string;
  created_at: string;
}

const MEDIA_ROOT = path.resolve(process.cwd(), 'data', 'media');

function ensureServiceMediaDir(service: MediaServiceType): string {
  const dir = path.resolve(MEDIA_ROOT, service === 'image' ? 'images' : 'videos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extensionFromMime(mimeType: string, service: MediaServiceType): string {
  const clean = mimeType.toLowerCase().split(';')[0].trim();
  if (clean === 'image/png') return 'png';
  if (clean === 'image/jpeg' || clean === 'image/jpg') return 'jpg';
  if (clean === 'image/webp') return 'webp';
  if (clean === 'video/mp4') return 'mp4';
  if (clean === 'video/webm') return 'webm';
  return service === 'image' ? 'png' : 'mp4';
}

export function resolveSafeMediaPath(service: MediaServiceType, filename: string): string {
  const baseDir = ensureServiceMediaDir(service);
  const safeName = path.basename(filename);
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid media path boundary.');
  }
  return resolved;
}

export function saveGeneratedMedia(params: {
  userId: string;
  service: MediaServiceType;
  model: string;
  mimeType: string;
  buffer: Buffer;
  origin?: string;
}): {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
} {
  const id = `med_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const ext = extensionFromMime(params.mimeType, params.service);
  const filename = `${id}.${ext}`;
  const fullPath = resolveSafeMediaPath(params.service, filename);

  fs.writeFileSync(fullPath, params.buffer);

  const rawToken = `glx_med_${randomBytes(24).toString('hex')}`;
  const tokenHash = hashToken(rawToken);
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO generated_media (
       id, user_id, service, model, mime_type, filename, size_bytes, access_token_hash, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.userId,
    params.service,
    params.model,
    params.mimeType,
    filename,
    params.buffer.length,
    tokenHash,
    createdAt,
  );

  const relativePath = `/v1/media/${id}?token=${encodeURIComponent(rawToken)}`;
  const url = params.origin ? `${params.origin}${relativePath}` : relativePath;

  return {
    id,
    url,
    mimeType: params.mimeType,
    sizeBytes: params.buffer.length,
  };
}

export function getMediaRecord(id: string): GeneratedMediaRow | undefined {
  return db
    .prepare(`SELECT * FROM generated_media WHERE id = ?`)
    .get(id) as unknown as GeneratedMediaRow | undefined;
}

export function verifyMediaCapabilityToken(record: GeneratedMediaRow, token: string): boolean {
  if (!token) return false;
  const candidateHash = hashToken(token);
  return verifyConstantTimeSecret(candidateHash, record.access_token_hash);
}
