import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { GenerateContentResponse } from '@google/genai';
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  addCounterTokens,
  db,
  getCounterCount,
  getServiceHealthMap,
  getUserServiceQuota,
  getUtcDateKey,
  getUtcMonthKey,
  incrementCounterRequests,
  setServiceHealth,
} from '../db.ts';
import type { ApiServiceId } from '../db.ts';
import {
  ALLOWED_IMAGE_ASPECT_RATIOS,
  ALLOWED_IMAGE_SIZES,
  ALLOWED_VIDEO_ASPECT_RATIOS,
  ALLOWED_VIDEO_DURATIONS,
  ALLOWED_VIDEO_RESOLUTIONS,
  ALLOWED_VOICES,
  EXTENDED_IMAGE_ASPECT_RATIOS,
  generateChatCompletion,
  generateCodeCompletion,
  generateImageAsset,
  generateSpeechAudio,
  generateVideoAsset,
  generateVisionAnalysis,
  GLAXYES_MODELS,
  IMAGE_MODELS,
  redactSecrets,
  resolveImageModel,
  resolveModel,
  resolveVideoModel,
  STANDARD_IMAGE_ASPECT_RATIOS,
  streamChatCompletion,
  transcribeAudio,
  VIDEO_MODELS,
  VOICE_TRANSCRIBE_MODELS,
  VOICE_TTS_MODELS,
} from '../gemini.ts';
import type { ChatMessageInput } from '../gemini.ts';
import {
  getMediaRecord,
  resolveSafeMediaPath,
  saveGeneratedMedia,
  verifyMediaCapabilityToken,
} from '../media.ts';
import {
  assertKeyServiceScope,
  extractBearerToken,
  requireApiKeyAuth,
} from '../middleware.ts';
import type { AuthenticatedRequest } from '../middleware.ts';
import { hashToken } from '../security.ts';

const router = Router();

function getRequestOrigin(req: Request): string {
  const host = req.get('host');
  const proto = req.protocol || 'https';
  return host ? `${proto}://${host}` : '';
}

// Public-capable (capability-token OR owner Bearer auth) secure media endpoint
router.get('/media/:id', (req, res) => {
  const mediaId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!mediaId) {
    res.status(400).json({ error: { message: 'Missing media id.', code: 'invalid_media_id' } });
    return;
  }

  const record = getMediaRecord(mediaId);
  if (!record) {
    res.status(404).json({ error: { message: 'Media asset not found.', code: 'media_not_found' } });
    return;
  }

  let authorized = false;
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (queryToken && verifyMediaCapabilityToken(record, queryToken)) {
    authorized = true;
  }

  if (!authorized) {
    const bearer = extractBearerToken(req);
    if (bearer) {
      const tokenHash = hashToken(bearer);
      if (bearer.startsWith('glx_live_')) {
        const keyRow = db
          .prepare(`SELECT user_id, status FROM api_keys WHERE key_hash = ?`)
          .get(tokenHash) as { user_id: string; status: string } | undefined;
        if (keyRow && keyRow.status === 'active' && keyRow.user_id === record.user_id) {
          authorized = true;
        }
      } else {
        const sessionRow = db
          .prepare(`SELECT user_id, expires_at FROM sessions WHERE token_hash = ?`)
          .get(tokenHash) as { user_id: string; expires_at: string } | undefined;
        if (
          sessionRow &&
          new Date(sessionRow.expires_at).getTime() > Date.now() &&
          sessionRow.user_id === record.user_id
        ) {
          authorized = true;
        }
      }
    }
  }

  if (!authorized) {
    res.status(401).json({
      error: {
        message: 'Unauthorized media access. Provide a valid capability token or owner credentials.',
        type: 'authentication_error',
        code: 'unauthorized_media',
      },
    });
    return;
  }

  let fullPath: string;
  try {
    fullPath = resolveSafeMediaPath(record.service, record.filename);
  } catch {
    res.status(400).json({ error: { message: 'Invalid media path.', code: 'invalid_path' } });
    return;
  }

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: { message: 'Media file missing on disk.', code: 'file_missing' } });
    return;
  }

  res.setHeader('Content-Type', record.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(fullPath);
});

router.use(requireApiKeyAuth);

router.get('/models', (_req, res) => {
  const healthMap = getServiceHealthMap();
  const imageActive = healthMap.get('image')?.status === 'active';
  const videoActive = healthMap.get('video')?.status === 'active';

  res.json({
    object: 'list',
    data: [
      ...GLAXYES_MODELS.map((m) => ({
        id: m.id,
        object: 'model',
        created: 1767225600,
        owned_by: 'glaxyes-ai',
        display_name: m.displayName,
        description: m.description,
        context_window: m.contextWindow,
        aliases: m.aliases,
        available: true,
        services: ['chat', 'coding', 'vision'],
      })),
      {
        id: 'gemini-3.8-flash-lite-tts',
        object: 'model',
        created: 1767225600,
        owned_by: 'glaxyes-ai',
        display_name: 'Gemini 3.8 Flash Lite TTS',
        description: 'High-efficiency neural text-to-speech returning 24kHz mono WAV.',
        available: true,
        services: ['voice'],
      },
      {
        id: 'gemini-3.8-flash-tts',
        object: 'model',
        created: 1767225600,
        owned_by: 'glaxyes-ai',
        display_name: 'Gemini 3.8 Flash TTS',
        description: 'Expressive TTS for custom voice personas and multi-speaker scripts.',
        available: true,
        services: ['voice'],
      },
      {
        id: 'gemini-3.5-transcribe',
        object: 'model',
        created: 1767225600,
        owned_by: 'glaxyes-ai',
        display_name: 'Gemini 3.5 Transcribe',
        description: 'Audio-to-text transcription for MP3, WAV, and WebM recordings.',
        available: true,
        services: ['voice'],
      },
      ...IMAGE_MODELS.map((m) => ({
        id: m.id,
        object: 'model',
        created: 1767225600,
        owned_by: 'glaxyes-ai',
        display_name: m.displayName,
        description: m.description,
        aliases: m.aliases,
        available: imageActive,
        services: ['image'],
      })),
      ...VIDEO_MODELS.map((m) => ({
        id: m.id,
        object: 'model',
        created: 1767225600,
        owned_by: 'glaxyes-ai',
        display_name: m.displayName,
        description: m.description,
        aliases: m.aliases,
        available: videoActive,
        services: ['video'],
      })),
    ],
  });
});

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

function secondsUntilNextUtcMonth(): number {
  const now = new Date();
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0);
  return Math.max(1, Math.ceil((nextMonth - now.getTime()) / 1000));
}

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Upstream Gemini request failed.';
  const redacted = redactSecrets(raw).trim();
  if (redacted.startsWith('{')) {
    try {
      const parsed = JSON.parse(redacted) as {
        error?: {
          code?: number;
          status?: string;
          message?: string;
          details?: Array<{
            violations?: Array<{ quotaMetric?: string; quotaId?: string; quotaDimensions?: Record<string, string> }>;
          }>;
        };
      };
      if (parsed?.error?.message) {
        const prefix = parsed.error.code ? `${parsed.error.code} ` : '';
        const firstLine = parsed.error.message.split('\n')[0].trim();
        const violations = parsed.error.details?.flatMap((d) => d.violations ?? []) ?? [];
        const quotaInfo = violations
          .map((v) => {
            const dimModel = v.quotaDimensions?.model ? ` model=${v.quotaDimensions.model}` : '';
            const qId = v.quotaId ? ` quotaId=${v.quotaId}` : '';
            return `${v.quotaMetric || 'quota'}${qId}${dimModel}`;
          })
          .filter(Boolean)
          .slice(0, 2)
          .join('; ');
        return quotaInfo ? `${prefix}${firstLine} [${quotaInfo}]` : `${prefix}${firstLine}`;
      }
    } catch {
      // fall back to redacted string
    }
  }
  return redacted.length > 420 ? `${redacted.slice(0, 417)}...` : redacted;
}

function classifyGeminiError(err: unknown): {
  statusCode: number;
  type: string;
  code: string;
} {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (
    msg.includes('402') ||
    msg.includes('billing') ||
    msg.includes('paid tier') ||
    msg.includes('freetier') ||
    msg.includes('free tier') ||
    msg.includes('limit: 0')
  ) {
    return {
      statusCode: 402,
      type: 'billing_required',
      code: 'billing_or_paid_tier_required',
    };
  }
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('permission_denied') ||
    msg.includes('forbidden')
  ) {
    return {
      statusCode: 403,
      type: 'provider_auth_error',
      code: 'provider_authentication_failed',
    };
  }
  if (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota')
  ) {
    return {
      statusCode: 429,
      type: 'rate_limit_exceeded',
      code: 'upstream_quota_exceeded',
    };
  }
  if (msg.includes('404') || msg.includes('not_found')) {
    return {
      statusCode: 404,
      type: 'invalid_request_error',
      code: 'upstream_model_not_found',
    };
  }
  if (msg.includes('400') || msg.includes('invalid_argument')) {
    return {
      statusCode: 400,
      type: 'invalid_request_error',
      code: 'upstream_invalid_argument',
    };
  }
  return {
    statusCode: 502,
    type: 'upstream_error',
    code: 'gemini_error',
  };
}

function reserveServiceQuotaAndHeaders(
  req: AuthenticatedRequest,
  res: Response,
  service: ApiServiceId,
): boolean {
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  if (!assertKeyServiceScope(apiKey, service, res)) {
    return false;
  }

  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();
  const svcQuota = getUserServiceQuota(user.id, user.plan, service);

  const svcDailyLimit =
    service === 'chat' ? Math.min(user.daily_limit, svcQuota.daily_limit) : svcQuota.daily_limit;
  const svcMonthlyLimit =
    service === 'chat' ? Math.min(user.monthly_limit, svcQuota.monthly_limit) : svcQuota.monthly_limit;

  const effectiveDailyLimit =
    apiKey.daily_limit !== null ? Math.min(svcDailyLimit, apiKey.daily_limit) : svcDailyLimit;
  const effectiveMonthlyLimit =
    apiKey.monthly_limit !== null ? Math.min(svcMonthlyLimit, apiKey.monthly_limit) : svcMonthlyLimit;

  let svcDailyAfter = 0;
  let svcMonthlyAfter = 0;

  try {
    db.exec('BEGIN IMMEDIATE');

    const svcDailyUsed = getCounterCount(`svc:${user.id}:${service}`, 'day', dayKey);
    const svcMonthlyUsed = getCounterCount(`svc:${user.id}:${service}`, 'month', monthKey);
    const keyDailyUsed = getCounterCount(`key:${apiKey.id}`, 'day', dayKey);
    const keyMonthlyUsed = getCounterCount(`key:${apiKey.id}`, 'month', monthKey);

    if (svcDailyUsed >= svcDailyLimit) {
      db.exec('ROLLBACK');
      res.setHeader('Retry-After', String(secondsUntilUtcMidnight()));
      res.setHeader('X-RateLimit-Service', service);
      res.setHeader('X-RateLimit-Limit-Day', String(svcDailyLimit));
      res.setHeader('X-RateLimit-Remaining-Day', '0');
      res.setHeader('X-RateLimit-Limit-Month', String(svcMonthlyLimit));
      res.setHeader(
        'X-RateLimit-Remaining-Month',
        String(Math.max(0, svcMonthlyLimit - svcMonthlyUsed)),
      );
      res.status(429).json({
        error: {
          message: `Daily ${service} API limit (${svcDailyLimit} requests/day) exceeded. Resets at 00:00 UTC.`,
          type: 'rate_limit_exceeded',
          code: 'daily_limit_exceeded',
        },
      });
      return false;
    }

    if (svcMonthlyUsed >= svcMonthlyLimit) {
      db.exec('ROLLBACK');
      res.setHeader('Retry-After', String(secondsUntilNextUtcMonth()));
      res.setHeader('X-RateLimit-Service', service);
      res.setHeader('X-RateLimit-Limit-Day', String(svcDailyLimit));
      res.setHeader(
        'X-RateLimit-Remaining-Day',
        String(Math.max(0, svcDailyLimit - svcDailyUsed)),
      );
      res.setHeader('X-RateLimit-Limit-Month', String(svcMonthlyLimit));
      res.setHeader('X-RateLimit-Remaining-Month', '0');
      res.status(429).json({
        error: {
          message: `Monthly ${service} API limit (${svcMonthlyLimit} requests/month) exceeded. Resets on the 1st of next month UTC.`,
          type: 'rate_limit_exceeded',
          code: 'monthly_limit_exceeded',
        },
      });
      return false;
    }

    if (apiKey.daily_limit !== null && keyDailyUsed >= apiKey.daily_limit) {
      db.exec('ROLLBACK');
      res.setHeader('Retry-After', String(secondsUntilUtcMidnight()));
      res.setHeader('X-RateLimit-Service', service);
      res.setHeader('X-RateLimit-Limit-Day', String(apiKey.daily_limit));
      res.setHeader('X-RateLimit-Remaining-Day', '0');
      res.status(429).json({
        error: {
          message: `API key daily limit (${apiKey.daily_limit} requests/day) exceeded.`,
          type: 'rate_limit_exceeded',
          code: 'key_daily_limit_exceeded',
        },
      });
      return false;
    }

    if (apiKey.monthly_limit !== null && keyMonthlyUsed >= apiKey.monthly_limit) {
      db.exec('ROLLBACK');
      res.setHeader('Retry-After', String(secondsUntilNextUtcMonth()));
      res.setHeader('X-RateLimit-Service', service);
      res.setHeader('X-RateLimit-Limit-Month', String(apiKey.monthly_limit));
      res.setHeader('X-RateLimit-Remaining-Month', '0');
      res.status(429).json({
        error: {
          message: `API key monthly limit (${apiKey.monthly_limit} requests/month) exceeded.`,
          type: 'rate_limit_exceeded',
          code: 'key_monthly_limit_exceeded',
        },
      });
      return false;
    }

    svcDailyAfter = incrementCounterRequests(`svc:${user.id}:${service}`, 'day', dayKey);
    svcMonthlyAfter = incrementCounterRequests(`svc:${user.id}:${service}`, 'month', monthKey);
    incrementCounterRequests(`user:${user.id}`, 'day', dayKey);
    incrementCounterRequests(`user:${user.id}`, 'month', monthKey);
    incrementCounterRequests(`key:${apiKey.id}`, 'day', dayKey);
    incrementCounterRequests(`key:${apiKey.id}`, 'month', monthKey);

    db.prepare(`UPDATE api_keys SET total_requests = total_requests + 1, last_used_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      apiKey.id,
    );

    db.exec('COMMIT');
  } catch {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    res.status(500).json({
      error: {
        message: 'Failed to process quota reservation.',
        type: 'server_error',
        code: 'quota_error',
      },
    });
    return false;
  }

  res.setHeader('X-RateLimit-Service', service);
  res.setHeader('X-RateLimit-Limit-Day', String(effectiveDailyLimit));
  res.setHeader('X-RateLimit-Remaining-Day', String(Math.max(0, svcDailyLimit - svcDailyAfter)));
  res.setHeader('X-RateLimit-Limit-Month', String(effectiveMonthlyLimit));
  res.setHeader('X-RateLimit-Remaining-Month', String(Math.max(0, svcMonthlyLimit - svcMonthlyAfter)));
  return true;
}

function recordUsageLog(entry: {
  service: ApiServiceId;
  userId: string;
  apiKeyId: string;
  model: string;
  requestedModel: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  statusCode: number;
  stream: boolean;
  errorMessage?: string | null;
}) {
  const dayKey = getUtcDateKey();
  const monthKey = getUtcMonthKey();

  db.prepare(
    `INSERT INTO usage_logs (
       id, user_id, api_key_id, service, model, requested_model,
       prompt_tokens, completion_tokens, total_tokens,
       latency_ms, status_code, stream, error_message, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `req_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    entry.userId,
    entry.apiKeyId,
    entry.service,
    entry.model,
    entry.requestedModel,
    entry.promptTokens,
    entry.completionTokens,
    entry.totalTokens,
    entry.latencyMs,
    entry.statusCode,
    entry.stream ? 1 : 0,
    entry.errorMessage ?? null,
    new Date().toISOString(),
  );

  if (entry.totalTokens > 0) {
    addCounterTokens(`svc:${entry.userId}:${entry.service}`, 'day', dayKey, entry.totalTokens);
    addCounterTokens(`svc:${entry.userId}:${entry.service}`, 'month', monthKey, entry.totalTokens);
    addCounterTokens(`user:${entry.userId}`, 'day', dayKey, entry.totalTokens);
    addCounterTokens(`user:${entry.userId}`, 'month', monthKey, entry.totalTokens);
    addCounterTokens(`key:${entry.apiKeyId}`, 'day', dayKey, entry.totalTokens);
    addCounterTokens(`key:${entry.apiKeyId}`, 'month', monthKey, entry.totalTokens);
  }
}

// 1. Glaxyes Chat API: POST /v1/chat/completions
router.post('/chat/completions', async (req: AuthenticatedRequest, res) => {
  const startedAt = Date.now();
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-3.1-flash-lite';
  const modelSpec = resolveModel(requestedModel);

  if (!modelSpec) {
    res.status(400).json({
      error: {
        message: `Unsupported model "${requestedModel}". Supported models: ${GLAXYES_MODELS.map((m) => m.id).join(', ')}.`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }

  const rawMessages = req.body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    res.status(400).json({
      error: {
        message: 'Field "messages" must be a non-empty array of { role, content } objects.',
        type: 'invalid_request_error',
        code: 'invalid_messages',
      },
    });
    return;
  }

  const validRoles = new Set(['system', 'user', 'assistant']);
  const messages: ChatMessageInput[] = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== 'object' || !validRoles.has(item.role)) {
      res.status(400).json({
        error: {
          message: 'Each message must specify role as "system", "user", or "assistant".',
          type: 'invalid_request_error',
          code: 'invalid_role',
        },
      });
      return;
    }
    if (typeof item.content !== 'string' && !Array.isArray(item.content)) {
      res.status(400).json({
        error: {
          message: 'Each message must contain string or text-part array "content".',
          type: 'invalid_request_error',
          code: 'invalid_content',
        },
      });
      return;
    }
    messages.push({ role: item.role, content: item.content });
  }

  const hasUserOrAssistantText = messages.some(
    (m) =>
      m.role !== 'system' &&
      (typeof m.content === 'string' ? m.content.trim().length > 0 : m.content.length > 0),
  );
  if (!hasUserOrAssistantText) {
    res.status(400).json({
      error: {
        message: 'At least one non-empty user message is required.',
        type: 'invalid_request_error',
        code: 'empty_messages',
      },
    });
    return;
  }

  const stream = Boolean(req.body?.stream);
  const maxTokens =
    typeof req.body?.max_tokens === 'number' && Number.isFinite(req.body.max_tokens)
      ? Math.floor(req.body.max_tokens)
      : undefined;

  if (!reserveServiceQuotaAndHeaders(req, res, 'chat')) return;

  const completionId = `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const createdUnix = Math.floor(Date.now() / 1000);

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let accumulatedText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    try {
      const responseStream = await streamChatCompletion({
        upstreamModel: modelSpec.upstreamModel,
        messages,
        maxTokens,
      });

      let firstChunk = true;
      for await (const chunk of responseStream) {
        const c = chunk as GenerateContentResponse;
        const deltaText = c.text ?? '';
        accumulatedText += deltaText;

        if (c.usageMetadata) {
          promptTokens = c.usageMetadata.promptTokenCount ?? promptTokens;
          completionTokens = c.usageMetadata.candidatesTokenCount ?? completionTokens;
          totalTokens = c.usageMetadata.totalTokenCount ?? promptTokens + completionTokens;
        }

        const payload = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: createdUnix,
          model: requestedModel,
          choices: [
            {
              index: 0,
              delta: firstChunk ? { role: 'assistant', content: deltaText } : { content: deltaText },
              finish_reason: null,
            },
          ],
        };
        firstChunk = false;
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }

      if (totalTokens === 0) {
        promptTokens = Math.max(1, Math.ceil(JSON.stringify(messages).length / 4));
        completionTokens = Math.max(1, Math.ceil(accumulatedText.length / 4));
        totalTokens = promptTokens + completionTokens;
      }

      const finalPayload = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: createdUnix,
        model: requestedModel,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
      };
      res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();

      recordUsageLog({
        service: 'chat',
        userId: user.id,
        apiKeyId: apiKey.id,
        model: modelSpec.upstreamModel,
        requestedModel,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs: Date.now() - startedAt,
        statusCode: 200,
        stream: true,
      });
    } catch (err) {
      const safeMessage = sanitizeErrorMessage(err);
      recordUsageLog({
        service: 'chat',
        userId: user.id,
        apiKeyId: apiKey.id,
        model: modelSpec.upstreamModel,
        requestedModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: Date.now() - startedAt,
        statusCode: 502,
        stream: true,
        errorMessage: safeMessage,
      });
      if (!res.headersSent) {
        res.status(502).json({
          error: { message: safeMessage, type: 'upstream_error', code: 'gemini_error' },
        });
      } else {
        res.write(
          `data: ${JSON.stringify({
            error: { message: safeMessage, type: 'upstream_error', code: 'gemini_error' },
          })}\n\n`,
        );
        res.end();
      }
    }
    return;
  }

  try {
    const result = await generateChatCompletion({
      upstreamModel: modelSpec.upstreamModel,
      messages,
      maxTokens,
    });

    recordUsageLog({
      service: 'chat',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: modelSpec.upstreamModel,
      requestedModel,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      latencyMs: Date.now() - startedAt,
      statusCode: 200,
      stream: false,
    });

    res.json({
      id: completionId,
      object: 'chat.completion',
      created: createdUnix,
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.text },
          finish_reason: result.finishReason,
        },
      ],
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.totalTokens,
      },
    });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    recordUsageLog({
      service: 'chat',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: modelSpec.upstreamModel,
      requestedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - startedAt,
      statusCode: 502,
      stream: false,
      errorMessage: safeMessage,
    });
    res.status(502).json({
      error: { message: safeMessage, type: 'upstream_error', code: 'gemini_error' },
    });
  }
});

// 2. Glaxyes Coding API: POST /v1/code/completions
router.post('/code/completions', async (req: AuthenticatedRequest, res) => {
  const startedAt = Date.now();
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-3.1-flash-lite';
  const modelSpec = resolveModel(requestedModel);
  if (!modelSpec) {
    res.status(400).json({
      error: {
        message: `Unsupported coding model "${requestedModel}". Supported: gemini-4-hydrogen, gemini-3.1-flash-lite.`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    res.status(400).json({
      error: {
        message: 'Field "prompt" is required and must be a non-empty string.',
        type: 'invalid_request_error',
        code: 'invalid_prompt',
      },
    });
    return;
  }

  const language = typeof req.body?.language === 'string' ? req.body.language.trim() : 'typescript';
  const task = typeof req.body?.task === 'string' ? req.body.task.trim() : 'generate';
  const contextCode = typeof req.body?.context_code === 'string' ? req.body.context_code : undefined;
  const maxTokens =
    typeof req.body?.max_tokens === 'number' && Number.isFinite(req.body.max_tokens)
      ? Math.floor(req.body.max_tokens)
      : undefined;

  if (!reserveServiceQuotaAndHeaders(req, res, 'coding')) return;

  try {
    const result = await generateCodeCompletion({
      upstreamModel: modelSpec.upstreamModel,
      prompt,
      language,
      task,
      contextCode,
      maxTokens,
    });

    recordUsageLog({
      service: 'coding',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: modelSpec.upstreamModel,
      requestedModel,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      latencyMs: Date.now() - startedAt,
      statusCode: 200,
      stream: false,
    });

    res.json({
      id: `codecmpl_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      object: 'code.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      language,
      task,
      output: result.output,
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.totalTokens,
      },
    });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    recordUsageLog({
      service: 'coding',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: modelSpec.upstreamModel,
      requestedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - startedAt,
      statusCode: 502,
      stream: false,
      errorMessage: safeMessage,
    });
    res.status(502).json({
      error: { message: safeMessage, type: 'upstream_error', code: 'gemini_error' },
    });
  }
});

// 3. Glaxyes Voice API: POST /v1/audio/speech (TTS) & POST /v1/audio/transcriptions
router.post('/audio/speech', async (req: AuthenticatedRequest, res) => {
  const startedAt = Date.now();
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-3.8-flash-lite-tts';

  if (!VOICE_TTS_MODELS.includes(requestedModel as (typeof VOICE_TTS_MODELS)[number])) {
    res.status(400).json({
      error: {
        message: `Unsupported TTS model "${requestedModel}". Supported: ${VOICE_TTS_MODELS.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }

  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  if (!input || input.length > 4000) {
    res.status(400).json({
      error: {
        message: 'Field "input" is required and must be between 1 and 4000 characters.',
        type: 'invalid_request_error',
        code: 'invalid_input',
      },
    });
    return;
  }

  const voice = typeof req.body?.voice === 'string' ? req.body.voice.trim() : 'Kore';
  if (!ALLOWED_VOICES.includes(voice as (typeof ALLOWED_VOICES)[number])) {
    res.status(400).json({
      error: {
        message: `Unsupported voice "${voice}". Supported: ${ALLOWED_VOICES.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'invalid_voice',
      },
    });
    return;
  }

  const style = typeof req.body?.style === 'string' ? req.body.style.trim() : undefined;

  if (!reserveServiceQuotaAndHeaders(req, res, 'voice')) return;

  try {
    const result = await generateSpeechAudio({
      model: requestedModel as (typeof VOICE_TTS_MODELS)[number],
      input,
      voiceName: voice,
      style,
    });

    recordUsageLog({
      service: 'voice',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: requestedModel,
      requestedModel,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      latencyMs: Date.now() - startedAt,
      statusCode: 200,
      stream: false,
    });

    res.json({
      id: `speech_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      object: 'audio.speech',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      voice,
      mime_type: result.mimeType,
      audio_base64: result.audioBase64,
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.totalTokens,
      },
    });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    recordUsageLog({
      service: 'voice',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: requestedModel,
      requestedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - startedAt,
      statusCode: 502,
      stream: false,
      errorMessage: safeMessage,
    });
    res.status(502).json({
      error: { message: safeMessage, type: 'upstream_error', code: 'gemini_error' },
    });
  }
});

router.post('/audio/transcriptions', async (req: AuthenticatedRequest, res) => {
  const startedAt = Date.now();
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-3.5-transcribe';

  if (!VOICE_TRANSCRIBE_MODELS.includes(requestedModel as (typeof VOICE_TRANSCRIBE_MODELS)[number])) {
    res.status(400).json({
      error: {
        message: `Unsupported transcription model "${requestedModel}". Supported: ${VOICE_TRANSCRIBE_MODELS.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }

  const audioBase64 = typeof req.body?.audio_base64 === 'string' ? req.body.audio_base64.trim() : '';
  const mimeType = typeof req.body?.mime_type === 'string' ? req.body.mime_type.trim() : 'audio/wav';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : undefined;

  if (!audioBase64) {
    res.status(400).json({
      error: {
        message: 'Field "audio_base64" is required.',
        type: 'invalid_request_error',
        code: 'invalid_audio',
      },
    });
    return;
  }

  const allowedAudioMimes = new Set(['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg']);
  if (!allowedAudioMimes.has(mimeType)) {
    res.status(400).json({
      error: {
        message: `Unsupported audio mime_type "${mimeType}". Allowed: audio/wav, audio/mp3, audio/mpeg, audio/webm, audio/ogg.`,
        type: 'invalid_request_error',
        code: 'invalid_mime_type',
      },
    });
    return;
  }

  if (!reserveServiceQuotaAndHeaders(req, res, 'voice')) return;

  try {
    const result = await transcribeAudio({ audioBase64, mimeType, prompt });

    recordUsageLog({
      service: 'voice',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: requestedModel,
      requestedModel,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      latencyMs: Date.now() - startedAt,
      statusCode: 200,
      stream: false,
    });

    res.json({
      id: `transcribe_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      object: 'audio.transcription',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      text: result.text,
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.totalTokens,
      },
    });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    recordUsageLog({
      service: 'voice',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: requestedModel,
      requestedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - startedAt,
      statusCode: 502,
      stream: false,
      errorMessage: safeMessage,
    });
    res.status(502).json({
      error: { message: safeMessage, type: 'upstream_error', code: 'gemini_error' },
    });
  }
});

// 4. Glaxyes Vision API: POST /v1/vision/analyze
router.post('/vision/analyze', async (req: AuthenticatedRequest, res) => {
  const startedAt = Date.now();
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-3.1-flash-lite';
  const modelSpec = resolveModel(requestedModel);
  if (!modelSpec) {
    res.status(400).json({
      error: {
        message: `Unsupported vision model "${requestedModel}". Supported: gemini-4-hydrogen, gemini-3.1-flash-lite.`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const imageBase64 = typeof req.body?.image_base64 === 'string' ? req.body.image_base64.trim() : '';
  const mimeType = typeof req.body?.mime_type === 'string' ? req.body.mime_type.trim() : 'image/png';

  if (!prompt || !imageBase64) {
    res.status(400).json({
      error: {
        message: 'Both "prompt" and "image_base64" are required.',
        type: 'invalid_request_error',
        code: 'invalid_vision_input',
      },
    });
    return;
  }

  const allowedImageMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  if (!allowedImageMimes.has(mimeType)) {
    res.status(400).json({
      error: {
        message: `Unsupported image mime_type "${mimeType}". Allowed: image/png, image/jpeg, image/webp.`,
        type: 'invalid_request_error',
        code: 'invalid_mime_type',
      },
    });
    return;
  }

  if (!reserveServiceQuotaAndHeaders(req, res, 'vision')) return;

  try {
    const result = await generateVisionAnalysis({
      upstreamModel: modelSpec.upstreamModel,
      prompt,
      imageBase64,
      mimeType,
    });

    recordUsageLog({
      service: 'vision',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: modelSpec.upstreamModel,
      requestedModel,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      latencyMs: Date.now() - startedAt,
      statusCode: 200,
      stream: false,
    });

    res.json({
      id: `vision_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      object: 'vision.analysis',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      analysis: result.analysis,
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.totalTokens,
      },
    });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    recordUsageLog({
      service: 'vision',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: modelSpec.upstreamModel,
      requestedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - startedAt,
      statusCode: 502,
      stream: false,
      errorMessage: safeMessage,
    });
    res.status(502).json({
      error: { message: safeMessage, type: 'upstream_error', code: 'gemini_error' },
    });
  }
});

// 5. Glaxyes Image Generation API: POST /v1/images/generations
router.post('/images/generations', async (req: AuthenticatedRequest, res) => {
  const startedAt = Date.now();
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  if (!assertKeyServiceScope(apiKey, 'image', res)) return;

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-3.1-flash-lite-image';

  const modelSpec = resolveImageModel(requestedModel);
  if (!modelSpec) {
    res.status(400).json({
      error: {
        message: `Unsupported image model "${requestedModel}". Supported: ${IMAGE_MODELS.map((m) => m.id).join(', ')}.`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) {
    res.status(400).json({
      error: {
        message: 'Field "prompt" is required and must be between 1 and 4000 characters.',
        type: 'invalid_request_error',
        code: 'invalid_prompt',
      },
    });
    return;
  }

  const rawAspect =
    typeof req.body?.aspect_ratio === 'string' && req.body.aspect_ratio.trim()
      ? req.body.aspect_ratio.trim()
      : '1:1';
  if (!ALLOWED_IMAGE_ASPECT_RATIOS.includes(rawAspect as (typeof ALLOWED_IMAGE_ASPECT_RATIOS)[number])) {
    res.status(400).json({
      error: {
        message: `Unsupported aspect_ratio "${rawAspect}". Allowed: ${ALLOWED_IMAGE_ASPECT_RATIOS.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'invalid_aspect_ratio',
      },
    });
    return;
  }

  if (
    EXTENDED_IMAGE_ASPECT_RATIOS.includes(rawAspect as (typeof EXTENDED_IMAGE_ASPECT_RATIOS)[number]) &&
    !modelSpec.supportsExtendedAspectRatios
  ) {
    res.status(400).json({
      error: {
        message: `Extended aspect_ratio "${rawAspect}" requires gemini-nano-banana-2.1 or gemini-3-pro-image. Standard ratios for ${modelSpec.id}: ${STANDARD_IMAGE_ASPECT_RATIOS.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'invalid_aspect_ratio',
      },
    });
    return;
  }

  let imageSize: '1K' | '2K' | '4K' | undefined;
  if (typeof req.body?.image_size === 'string' && req.body.image_size.trim()) {
    const candidateSize = req.body.image_size.trim().toUpperCase();
    if (!ALLOWED_IMAGE_SIZES.includes(candidateSize as (typeof ALLOWED_IMAGE_SIZES)[number])) {
      res.status(400).json({
        error: {
          message: `Unsupported image_size "${candidateSize}". Allowed: ${ALLOWED_IMAGE_SIZES.join(', ')}.`,
          type: 'invalid_request_error',
          code: 'invalid_image_size',
        },
      });
      return;
    }
    imageSize = candidateSize as '1K' | '2K' | '4K';
  }

  const outputFormat =
    typeof req.body?.output_format === 'string' && req.body.output_format.trim()
      ? req.body.output_format.trim().toLowerCase()
      : 'both';
  if (!['both', 'url', 'b64_json'].includes(outputFormat)) {
    res.status(400).json({
      error: {
        message: 'Field "output_format" must be "both", "url", or "b64_json".',
        type: 'invalid_request_error',
        code: 'invalid_output_format',
      },
    });
    return;
  }

  const inputImageBase64 =
    typeof req.body?.image_base64 === 'string' && req.body.image_base64.trim()
      ? req.body.image_base64.trim()
      : undefined;
  const inputImageMimeType =
    typeof req.body?.mime_type === 'string' && req.body.mime_type.trim()
      ? req.body.mime_type.trim()
      : 'image/png';

  if (inputImageBase64) {
    const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedMimes.has(inputImageMimeType)) {
      res.status(400).json({
        error: {
          message: `Unsupported reference mime_type "${inputImageMimeType}". Allowed: image/png, image/jpeg, image/webp.`,
          type: 'invalid_request_error',
          code: 'invalid_mime_type',
        },
      });
      return;
    }
  }

  if (!reserveServiceQuotaAndHeaders(req, res, 'image')) return;

  console.info(
    `[v1:images] Request user=${user.id} key=${apiKey.id} requestedModel=${requestedModel} upstreamModel=${modelSpec.upstreamModels[0]} aspect=${rawAspect} imageSize=${imageSize || 'default'} edit=${Boolean(inputImageBase64)}`,
  );

  try {
    const result = await generateImageAsset({
      modelSpec,
      prompt,
      aspectRatio: rawAspect,
      imageSize,
      inputImageBase64,
      inputImageMimeType,
    });

    const buffer = Buffer.from(result.imageBase64, 'base64');
    const savedMedia = saveGeneratedMedia({
      userId: user.id,
      service: 'image',
      model: result.upstreamModel,
      mimeType: result.mimeType,
      buffer,
      origin: getRequestOrigin(req),
    });

    const latencyMs = Date.now() - startedAt;
    setServiceHealth('image', 'active', result.upstreamModel, null);

    recordUsageLog({
      service: 'image',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: result.upstreamModel,
      requestedModel,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      latencyMs,
      statusCode: 200,
      stream: false,
    });

    console.info(
      `[v1:images] Success user=${user.id} model=${result.upstreamModel} mediaId=${savedMedia.id} sizeBytes=${savedMedia.sizeBytes} latencyMs=${latencyMs}`,
    );

    const itemPayload: Record<string, unknown> = {
      media_id: savedMedia.id,
      url: savedMedia.url,
      mime_type: savedMedia.mimeType,
      size_bytes: savedMedia.sizeBytes,
    };
    if (outputFormat === 'both' || outputFormat === 'b64_json') {
      itemPayload.b64_json = result.imageBase64;
    }

    res.json({
      id: `img_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      object: 'image.generation',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      upstream_model: result.upstreamModel,
      aspect_ratio: rawAspect,
      ...(result.text ? { text: result.text } : {}),
      data: [itemPayload],
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.totalTokens,
      },
    });
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    const classified = classifyGeminiError(err);
    const latencyMs = Date.now() - startedAt;
    setServiceHealth('image', 'error', modelSpec.upstreamModels[0], safeMessage);

    recordUsageLog({
      service: 'image',
      userId: user.id,
      apiKeyId: apiKey.id,
      model: modelSpec.upstreamModels[0],
      requestedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      statusCode: classified.statusCode,
      stream: false,
      errorMessage: safeMessage,
    });

    console.error(
      `[v1:images] Failed user=${user.id} model=${modelSpec.upstreamModels[0]} status=${classified.statusCode} code=${classified.code} latencyMs=${latencyMs} message=${safeMessage}`,
    );

    res.status(classified.statusCode).json({
      error: {
        message: safeMessage,
        type: classified.type,
        code: classified.code,
      },
    });
  }
});

interface VideoJobRow {
  id: string;
  user_id: string;
  api_key_id: string | null;
  model: string;
  requested_model: string;
  prompt: string;
  mode: string;
  aspect_ratio: string;
  duration: string;
  resolution: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  interaction_id: string | null;
  media_id: string | null;
  video_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  error_message: string | null;
  latency_ms: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

async function processVideoJob(params: {
  jobId: string;
  userId: string;
  apiKeyId: string;
  upstreamModel: string;
  requestedModel: string;
  prompt: string;
  aspectRatio: string;
  duration: string;
  resolution: string;
  inputImageBase64?: string;
  inputImageMimeType?: string;
  origin: string;
}): Promise<void> {
  const startedAt = Date.now();
  try {
    console.info(
      `[v1:videos] Job processing jobId=${params.jobId} user=${params.userId} model=${params.upstreamModel} aspect=${params.aspectRatio} duration=${params.duration} resolution=${params.resolution}`,
    );

    db.prepare(`UPDATE video_jobs SET status = 'processing', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      params.jobId,
    );

    const result = await generateVideoAsset({
      upstreamModel: params.upstreamModel,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
      resolution: params.resolution,
      inputImageBase64: params.inputImageBase64,
      inputImageMimeType: params.inputImageMimeType,
    });

    const buffer = Buffer.from(result.videoBase64, 'base64');
    const savedMedia = saveGeneratedMedia({
      userId: params.userId,
      service: 'video',
      model: params.upstreamModel,
      mimeType: result.mimeType,
      buffer,
      origin: params.origin,
    });

    const completedAt = new Date().toISOString();
    const latencyMs = Date.now() - startedAt;

    db.prepare(
      `UPDATE video_jobs
       SET status = 'succeeded',
           interaction_id = ?,
           media_id = ?,
           video_url = ?,
           mime_type = ?,
           size_bytes = ?,
           latency_ms = ?,
           updated_at = ?,
           completed_at = ?
       WHERE id = ?`,
    ).run(
      result.interactionId,
      savedMedia.id,
      savedMedia.url,
      savedMedia.mimeType,
      savedMedia.sizeBytes,
      latencyMs,
      completedAt,
      completedAt,
      params.jobId,
    );

    setServiceHealth('video', 'active', params.upstreamModel, null);

    recordUsageLog({
      service: 'video',
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      model: params.upstreamModel,
      requestedModel: params.requestedModel,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      latencyMs,
      statusCode: 200,
      stream: false,
    });

    console.info(
      `[v1:videos] Job succeeded jobId=${params.jobId} mediaId=${savedMedia.id} sizeBytes=${savedMedia.sizeBytes} latencyMs=${latencyMs}`,
    );
  } catch (err) {
    const safeMessage = sanitizeErrorMessage(err);
    const classified = classifyGeminiError(err);
    const completedAt = new Date().toISOString();
    const latencyMs = Date.now() - startedAt;

    db.prepare(
      `UPDATE video_jobs
       SET status = 'failed',
           error_message = ?,
           latency_ms = ?,
           updated_at = ?,
           completed_at = ?
       WHERE id = ?`,
    ).run(safeMessage, latencyMs, completedAt, completedAt, params.jobId);

    setServiceHealth('video', 'error', params.upstreamModel, safeMessage);

    recordUsageLog({
      service: 'video',
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      model: params.upstreamModel,
      requestedModel: params.requestedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      statusCode: classified.statusCode,
      stream: false,
      errorMessage: safeMessage,
    });

    console.error(
      `[v1:videos] Job failed jobId=${params.jobId} model=${params.upstreamModel} status=${classified.statusCode} code=${classified.code} latencyMs=${latencyMs} message=${safeMessage}`,
    );
  }
}

// 6. Glaxyes Video Generation API: POST /v1/videos/generations & GET /v1/videos/jobs/:id
router.post('/videos/generations', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  if (!assertKeyServiceScope(apiKey, 'video', res)) return;

  const requestedModel =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'gemini-omni-1.2-flash';

  const modelSpec = resolveVideoModel(requestedModel);
  if (!modelSpec) {
    res.status(400).json({
      error: {
        message: `Unsupported video model "${requestedModel}". Supported: ${VIDEO_MODELS.map((m) => m.id).join(', ')}.`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    return;
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) {
    res.status(400).json({
      error: {
        message: 'Field "prompt" is required and must be between 1 and 4000 characters.',
        type: 'invalid_request_error',
        code: 'invalid_prompt',
      },
    });
    return;
  }

  const aspectRatio =
    typeof req.body?.aspect_ratio === 'string' && req.body.aspect_ratio.trim()
      ? req.body.aspect_ratio.trim()
      : '16:9';
  if (!ALLOWED_VIDEO_ASPECT_RATIOS.includes(aspectRatio as (typeof ALLOWED_VIDEO_ASPECT_RATIOS)[number])) {
    res.status(400).json({
      error: {
        message: `Unsupported aspect_ratio "${aspectRatio}". Allowed: ${ALLOWED_VIDEO_ASPECT_RATIOS.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'invalid_aspect_ratio',
      },
    });
    return;
  }

  const duration =
    typeof req.body?.duration === 'string' && req.body.duration.trim()
      ? req.body.duration.trim().toLowerCase()
      : '5s';
  if (!ALLOWED_VIDEO_DURATIONS.includes(duration as (typeof ALLOWED_VIDEO_DURATIONS)[number])) {
    res.status(400).json({
      error: {
        message: `Unsupported duration "${duration}". Allowed: ${ALLOWED_VIDEO_DURATIONS.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'invalid_duration',
      },
    });
    return;
  }

  const resolution =
    typeof req.body?.resolution === 'string' && req.body.resolution.trim()
      ? req.body.resolution.trim().toLowerCase()
      : '720p';
  if (!ALLOWED_VIDEO_RESOLUTIONS.includes(resolution as (typeof ALLOWED_VIDEO_RESOLUTIONS)[number])) {
    res.status(400).json({
      error: {
        message: `Unsupported resolution "${resolution}". Allowed: ${ALLOWED_VIDEO_RESOLUTIONS.join(', ')}.`,
        type: 'invalid_request_error',
        code: 'invalid_resolution',
      },
    });
    return;
  }

  const inputImageBase64 =
    typeof req.body?.image_base64 === 'string' && req.body.image_base64.trim()
      ? req.body.image_base64.trim()
      : undefined;
  const inputImageMimeType =
    typeof req.body?.mime_type === 'string' && req.body.mime_type.trim()
      ? req.body.mime_type.trim()
      : 'image/png';

  if (inputImageBase64) {
    const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedMimes.has(inputImageMimeType)) {
      res.status(400).json({
        error: {
          message: `Unsupported starting frame mime_type "${inputImageMimeType}". Allowed: image/png, image/jpeg, image/webp.`,
          type: 'invalid_request_error',
          code: 'invalid_mime_type',
        },
      });
      return;
    }
  }

  if (!reserveServiceQuotaAndHeaders(req, res, 'video')) return;

  const jobId = `vidjob_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const mode = inputImageBase64 ? 'image_to_video' : 'text_to_video';
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO video_jobs (
       id, user_id, api_key_id, model, requested_model, prompt, mode,
       aspect_ratio, duration, resolution, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
  ).run(
    jobId,
    user.id,
    apiKey.id,
    modelSpec.upstreamModel,
    requestedModel,
    prompt,
    mode,
    aspectRatio,
    duration,
    resolution,
    now,
    now,
  );

  const origin = getRequestOrigin(req);

  console.info(
    `[v1:videos] Job queued jobId=${jobId} user=${user.id} key=${apiKey.id} model=${modelSpec.upstreamModel} mode=${mode} aspect=${aspectRatio} duration=${duration} resolution=${resolution}`,
  );

  setImmediate(() => {
    void processVideoJob({
      jobId,
      userId: user.id,
      apiKeyId: apiKey.id,
      upstreamModel: modelSpec.upstreamModel,
      requestedModel,
      prompt,
      aspectRatio,
      duration,
      resolution,
      inputImageBase64,
      inputImageMimeType,
      origin,
    });
  });

  res.status(202).json({
    id: jobId,
    object: 'video.job',
    created: Math.floor(Date.now() / 1000),
    status: 'queued',
    model: requestedModel,
    upstream_model: modelSpec.upstreamModel,
    mode,
    aspect_ratio: aspectRatio,
    duration,
    resolution,
    poll_url: `/v1/videos/jobs/${jobId}`,
  });
});

router.get('/videos/jobs/:id', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const apiKey = req.apiKeyRecord!;

  if (!assertKeyServiceScope(apiKey, 'video', res)) return;

  const jobId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const job = db
    .prepare(`SELECT * FROM video_jobs WHERE id = ? AND user_id = ?`)
    .get(jobId, user.id) as unknown as VideoJobRow | undefined;

  if (!job) {
    res.status(404).json({
      error: {
        message: 'Video generation job not found.',
        type: 'invalid_request_error',
        code: 'job_not_found',
      },
    });
    return;
  }

  res.json({
    id: job.id,
    object: 'video.job',
    status: job.status,
    model: job.requested_model,
    upstream_model: job.model,
    mode: job.mode,
    aspect_ratio: job.aspect_ratio,
    duration: job.duration,
    resolution: job.resolution,
    media_id: job.media_id,
    video_url: job.video_url,
    mime_type: job.mime_type,
    size_bytes: job.size_bytes !== null ? Number(job.size_bytes) : null,
    latency_ms: Number(job.latency_ms),
    error: job.error_message ? { message: job.error_message } : null,
    created_at: job.created_at,
    updated_at: job.updated_at,
    completed_at: job.completed_at,
  });
});

export default router;

