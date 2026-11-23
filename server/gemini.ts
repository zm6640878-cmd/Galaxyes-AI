import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentConfig, GenerateContentResponse } from '@google/genai';

export interface GlaxyesModelSpec {
  id: string;
  upstreamModel: string;
  displayName: string;
  description: string;
  contextWindow: number;
  aliases: string[];
  tier: 'standard' | 'fast';
  service: 'chat' | 'coding' | 'voice' | 'vision';
}

export const GLAXYES_MODELS: GlaxyesModelSpec[] = [
  {
    id: 'gemini-3.1-flash-lite',
    upstreamModel: 'gemini-3.1-flash-lite',
    displayName: 'Glaxyes Flash Lite',
    description: 'Ultra-low latency model optimized for classification, extraction, coding, vision, and high-throughput chat.',
    contextWindow: 1048576,
    aliases: ['glaxyes-flash-lite', 'glaxyes-3.1-lite'],
    tier: 'fast',
    service: 'chat',
  },
  {
    id: 'gemini-4-hydrogen',
    upstreamModel: 'gemini-4-hydrogen',
    displayName: 'Glaxyes 4 Hydrogen',
    description: 'Primary balanced Gemini 4 model for general text, code generation, vision, and reasoning.',
    contextWindow: 1048576,
    aliases: ['glaxyes-4-hydrogen', 'glaxyes-4-fast'],
    tier: 'standard',
    service: 'chat',
  },
];

export const VOICE_TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'] as const;
export const VOICE_TRANSCRIBE_MODELS = ['gemini-3.5-transcribe'] as const;
export const ALLOWED_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const;

export function resolveModel(requestedModel: string | undefined): GlaxyesModelSpec | null {
  const normalized = (requestedModel || 'gemini-3.1-flash-lite').trim().toLowerCase();
  for (const spec of GLAXYES_MODELS) {
    if (spec.id === normalized || spec.aliases.includes(normalized)) {
      return spec;
    }
  }
  return null;
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type?: string; text?: string }>;
}

function normalizeMessageContent(content: ChatMessageInput['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function buildGeminiPayload(
  messages: ChatMessageInput[],
  upstreamModel: string,
  maxTokens?: number,
): { contents: Content[]; config: GenerateContentConfig } {
  const systemParts: string[] = [];
  const contents: Content[] = [];

  for (const msg of messages) {
    const text = normalizeMessageContent(msg.content).trim();
    if (!text) continue;

    if (msg.role === 'system') {
      systemParts.push(text);
    } else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text }],
      });
    } else {
      contents.push({
        role: 'user',
        parts: [{ text }],
      });
    }
  }

  const config: GenerateContentConfig = {};
  if (systemParts.length > 0) {
    config.systemInstruction = systemParts.join('\n\n');
  }

  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    if (upstreamModel !== 'gemini-4-hydrogen' || maxTokens >= 128) {
      config.maxOutputTokens = Math.min(Math.floor(maxTokens), 8192);
    }
  }

  return { contents, config };
}

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('Server GEMINI_API_KEY is not configured. Add it in Settings > Secrets.');
  }
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedApiKey = apiKey;
  }
  return cachedClient;
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isQuotaZeroOrBilling =
        msg.includes('limit: 0') ||
        msg.includes('FreeTier') ||
        msg.includes('check your plan and billing');
      const isTransient =
        !isQuotaZeroOrBilling &&
        (msg.includes('"code":503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('"code":429') ||
          msg.includes('high demand'));
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function generateChatCompletion(params: {
  upstreamModel: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
}): Promise<{
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
}> {
  const ai = getGeminiClient();
  const { contents, config } = buildGeminiPayload(
    params.messages,
    params.upstreamModel,
    params.maxTokens,
  );

  const response: GenerateContentResponse = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: params.upstreamModel,
      contents,
      config,
    }),
  );

  const text = response.text ?? '';
  const usage = response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? Math.max(1, Math.ceil(JSON.stringify(contents).length / 4));
  const completionTokens = usage?.candidatesTokenCount ?? Math.max(1, Math.ceil(text.length / 4));
  const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;
  const rawFinish = response.candidates?.[0]?.finishReason;
  const finishReason = rawFinish === 'MAX_TOKENS' ? 'length' : 'stop';

  return {
    text,
    promptTokens,
    completionTokens,
    totalTokens,
    finishReason,
  };
}

export async function streamChatCompletion(params: {
  upstreamModel: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
}) {
  const ai = getGeminiClient();
  const { contents, config } = buildGeminiPayload(
    params.messages,
    params.upstreamModel,
    params.maxTokens,
  );

  return withGeminiRetry(() =>
    ai.models.generateContentStream({
      model: params.upstreamModel,
      contents,
      config,
    }),
  );
}

export async function generateCodeCompletion(params: {
  upstreamModel: string;
  prompt: string;
  language?: string;
  task?: string;
  contextCode?: string;
  maxTokens?: number;
}): Promise<{
  output: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const ai = getGeminiClient();
  const taskLabel = params.task || 'generate';
  const langLabel = params.language || 'auto-detect';

  const systemInstruction = [
    'You are the Glaxyes Coding API engine.',
    `Task mode: ${taskLabel}. Target language: ${langLabel}.`,
    'Provide clean, production-grade code with brief, precise technical notes when helpful. Never include placeholder stubs.',
  ].join(' ');

  const promptParts = [params.prompt.trim()];
  if (params.contextCode?.trim()) {
    promptParts.push(`\nSource context:\n\`\`\`${params.language || ''}\n${params.contextCode.trim()}\n\`\`\``);
  }

  const config: GenerateContentConfig = {
    systemInstruction,
  };
  if (typeof params.maxTokens === 'number' && Number.isFinite(params.maxTokens) && params.maxTokens > 0) {
    if (params.upstreamModel !== 'gemini-4-hydrogen' || params.maxTokens >= 128) {
      config.maxOutputTokens = Math.min(Math.floor(params.maxTokens), 8192);
    }
  }

  const response: GenerateContentResponse = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: params.upstreamModel,
      contents: promptParts.join('\n'),
      config,
    }),
  );

  const output = response.text ?? '';
  const usage = response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? Math.max(1, Math.ceil(promptParts.join('\n').length / 4));
  const completionTokens = usage?.candidatesTokenCount ?? Math.max(1, Math.ceil(output.length / 4));
  const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

  return { output, promptTokens, completionTokens, totalTokens };
}

export async function generateVisionAnalysis(params: {
  upstreamModel: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
}): Promise<{
  analysis: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const ai = getGeminiClient();
  const response: GenerateContentResponse = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: params.upstreamModel,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: params.imageBase64,
            },
          },
          {
            text: params.prompt,
          },
        ],
      },
    }),
  );

  const analysis = response.text ?? '';
  const usage = response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? Math.max(1, Math.ceil(params.prompt.length / 4) + 256);
  const completionTokens = usage?.candidatesTokenCount ?? Math.max(1, Math.ceil(analysis.length / 4));
  const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

  return { analysis, promptTokens, completionTokens, totalTokens };
}

export async function generateSpeechAudio(params: {
  model: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
  input: string;
  voiceName: string;
  style?: string;
}): Promise<{
  audioBase64: string;
  mimeType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const ai = getGeminiClient();

  const textPart: Record<string, unknown> = { text: params.input };
  if (params.style?.trim()) {
    textPart.speechMetadata = { style: params.style.trim() };
  }

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: params.model,
      contents: [
        {
          role: 'user',
          parts: [textPart as { text: string }],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: params.voiceName },
          },
        },
      },
    }),
  );

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const audioBase64 = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType || 'audio/wav';

  if (!audioBase64) {
    throw new Error('Speech synthesis returned no audio payload.');
  }

  const usage = response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? Math.max(1, Math.ceil(params.input.length / 4));
  const completionTokens = usage?.candidatesTokenCount ?? Math.max(64, Math.ceil(audioBase64.length / 100));
  const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

  return { audioBase64, mimeType, promptTokens, completionTokens, totalTokens };
}

export async function transcribeAudio(params: {
  audioBase64: string;
  mimeType: string;
  prompt?: string;
}): Promise<{
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const ai = getGeminiClient();
  const instruction = params.prompt?.trim() || 'Transcribe this audio accurately.';
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: params.audioBase64,
            },
          },
          { text: instruction },
        ],
      },
    }),
  );

  const text = response.text ?? '';
  const usage = response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? 128;
  const completionTokens = usage?.candidatesTokenCount ?? Math.max(1, Math.ceil(text.length / 4));
  const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

  return { text, promptTokens, completionTokens, totalTokens };
}

export function redactSecrets(input: string): string {
  return input
    .replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/glx_live_[0-9A-Za-z_-]+/g, '[REDACTED_GLAXYES_KEY]')
    .replace(/glx_med_[0-9A-Za-z_-]+/g, '[REDACTED_MEDIA_TOKEN]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}

export interface ImageModelSpec {
  id: string;
  upstreamModels: string[];
  displayName: string;
  description: string;
  supportsImageSize: boolean;
  supportsExtendedAspectRatios: boolean;
  aliases: string[];
}

export const IMAGE_MODELS: ImageModelSpec[] = [
  {
    id: 'gemini-3.1-flash-lite-image',
    upstreamModels: ['gemini-3.1-flash-lite-image'],
    displayName: 'Gemini 3.1 Flash Lite Image',
    description: 'Default supported Gemini image generation and editing model.',
    supportsImageSize: false,
    supportsExtendedAspectRatios: false,
    aliases: ['gemini-3.1-flash-image', 'gemini-flash-image', 'nano-banana'],
  },
  {
    id: 'gemini-nano-banana-2.1',
    upstreamModels: ['gemini-nano-banana-2.1'],
    displayName: 'Gemini Nano Banana 2.1',
    description: 'High-fidelity image generation supporting 1K, 2K, 4K resolutions and extended aspect ratios.',
    supportsImageSize: true,
    supportsExtendedAspectRatios: true,
    aliases: ['nano-banana-2.1'],
  },
  {
    id: 'gemini-3-pro-image',
    upstreamModels: ['gemini-3-pro-image'],
    displayName: 'Gemini 3 Pro Image',
    description: 'Pro-grade image generation supporting 1K, 2K, and 4K output resolutions.',
    supportsImageSize: true,
    supportsExtendedAspectRatios: true,
    aliases: ['nano-banana-pro'],
  },
];

export const STANDARD_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const;

export const EXTENDED_IMAGE_ASPECT_RATIOS = ['1:4', '1:8', '4:1', '8:1'] as const;

export const ALLOWED_IMAGE_ASPECT_RATIOS = [
  ...STANDARD_IMAGE_ASPECT_RATIOS,
  ...EXTENDED_IMAGE_ASPECT_RATIOS,
] as const;

export const ALLOWED_IMAGE_SIZES = ['1K', '2K', '4K'] as const;

export function resolveImageModel(requestedModel: string | undefined): ImageModelSpec | null {
  const normalized = (requestedModel || 'gemini-3.1-flash-lite-image').trim().toLowerCase();
  for (const spec of IMAGE_MODELS) {
    if (spec.id === normalized || spec.aliases.includes(normalized)) {
      return spec;
    }
  }
  return null;
}

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found');
}

export async function generateImageAsset(params: {
  modelSpec: ImageModelSpec;
  prompt: string;
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  inputImageBase64?: string;
  inputImageMimeType?: string;
}): Promise<{
  upstreamModel: string;
  imageBase64: string;
  mimeType: string;
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const ai = getGeminiClient();
  const candidates = params.modelSpec.upstreamModels;
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i += 1) {
    const upstreamModel = candidates[i];
    const startedAt = Date.now();
    try {
      const imageConfig: { aspectRatio?: string; imageSize?: string } = {};
      if (params.aspectRatio) {
        imageConfig.aspectRatio = params.aspectRatio;
      }
      if (params.imageSize && params.modelSpec.supportsImageSize) {
        imageConfig.imageSize = params.imageSize;
      }

      const contents =
        params.inputImageBase64 && params.inputImageMimeType
          ? {
              parts: [
                {
                  inlineData: {
                    data: params.inputImageBase64,
                    mimeType: params.inputImageMimeType,
                  },
                },
                { text: params.prompt },
              ],
            }
          : {
              parts: [{ text: params.prompt }],
            };

      const config: GenerateContentConfig =
        Object.keys(imageConfig).length > 0 ? { imageConfig } : {};

      console.info(
        `[glaxyes:image] Calling Gemini generateContent model=${upstreamModel} aspectRatio=${params.aspectRatio || '1:1'} imageSize=${imageConfig.imageSize || 'default'} edit=${Boolean(params.inputImageBase64)}`,
      );

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: upstreamModel,
          contents,
          config,
        }),
      );

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let imageBase64 = '';
      let mimeType = 'image/png';
      const textParts: string[] = [];

      for (const part of parts) {
        if (part.inlineData?.data && !imageBase64) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
        } else if (typeof part.text === 'string' && part.text.trim()) {
          textParts.push(part.text.trim());
        }
      }

      if (!imageBase64) {
        throw new Error('Image generation returned no image payload.');
      }

      const usage = response.usageMetadata;
      const promptTokens =
        usage?.promptTokenCount ?? Math.max(1, Math.ceil(params.prompt.length / 4));
      const completionTokens = usage?.candidatesTokenCount ?? 1024;
      const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

      console.info(
        `[glaxyes:image] Success model=${upstreamModel} mime=${mimeType} latencyMs=${Date.now() - startedAt}`,
      );

      return {
        upstreamModel,
        imageBase64,
        mimeType,
        text: textParts.join('\n'),
        promptTokens,
        completionTokens,
        totalTokens,
      };
    } catch (err) {
      lastError = err;
      const safeErr = redactSecrets(err instanceof Error ? err.message : String(err));
      console.error(
        `[glaxyes:image] Upstream error model=${upstreamModel} latencyMs=${Date.now() - startedAt} error=${safeErr.slice(0, 400)}`,
      );
      if (i < candidates.length - 1 && isModelNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Image generation failed.');
}

export interface VideoModelSpec {
  id: string;
  upstreamModel: string;
  displayName: string;
  description: string;
  aliases: string[];
}

export const VIDEO_MODELS: VideoModelSpec[] = [
  {
    id: 'gemini-omni-1.2-flash',
    upstreamModel: 'gemini-omni-1.2-flash',
    displayName: 'Gemini Omni 1.2 Flash',
    description: 'Supported Google text-to-video and image-to-video generation model via Gemini Interactions API.',
    aliases: ['veo', 'veo-lite', 'gemini-omni-flash'],
  },
];

export const ALLOWED_VIDEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export const ALLOWED_VIDEO_RESOLUTIONS = ['360p', '720p', '1080p', '4k'] as const;
export const ALLOWED_VIDEO_DURATIONS = [
  '3s',
  '4s',
  '5s',
  '6s',
  '7s',
  '8s',
  '9s',
  '10s',
  '11s',
  '12s',
  '13s',
  '14s',
  '15s',
] as const;

export function resolveVideoModel(requestedModel: string | undefined): VideoModelSpec | null {
  const normalized = (requestedModel || 'gemini-omni-1.2-flash').trim().toLowerCase();
  for (const spec of VIDEO_MODELS) {
    if (spec.id === normalized || spec.aliases.includes(normalized)) {
      return spec;
    }
  }
  return null;
}

export async function generateVideoAsset(params: {
  upstreamModel: string;
  prompt: string;
  aspectRatio: string;
  duration: string;
  resolution: string;
  inputImageBase64?: string;
  inputImageMimeType?: string;
}): Promise<{
  interactionId: string;
  videoBase64: string;
  mimeType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const ai = getGeminiClient();
  const startedAt = Date.now();

  const input =
    params.inputImageBase64 && params.inputImageMimeType
      ? [
          {
            type: 'image' as const,
            data: params.inputImageBase64,
            mime_type: params.inputImageMimeType,
          },
          {
            type: 'text' as const,
            text: params.prompt,
          },
        ]
      : params.prompt;

  console.info(
    `[glaxyes:video] Calling Gemini Interactions API model=${params.upstreamModel} aspectRatio=${params.aspectRatio} duration=${params.duration} resolution=${params.resolution} imageToVideo=${Boolean(params.inputImageBase64)}`,
  );

  try {
    const interaction = await ai.interactions.create(
      {
        model: params.upstreamModel,
        input,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: params.aspectRatio,
          duration: params.duration,
          resolution: params.resolution,
        },
      },
      { timeout: 300000 },
    );

    if (interaction.status === 'failed' || (interaction.errors && interaction.errors.length > 0)) {
      const errMsg =
        interaction.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
        'Upstream video generation failed.';
      throw new Error(errMsg);
    }

    const videoBlock = interaction.output_video;
    const videoBase64 = videoBlock?.data;
    const mimeType = videoBlock?.mime_type || 'video/mp4';

    if (!videoBase64) {
      throw new Error('Video generation completed without returning a video payload.');
    }

    const usage = interaction.usage;
    const promptTokens =
      usage?.total_input_tokens ?? Math.max(1, Math.ceil(params.prompt.length / 4));
    const completionTokens = usage?.total_output_tokens ?? 2048;
    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;

    console.info(
      `[glaxyes:video] Success model=${params.upstreamModel} interactionId=${interaction.id} mime=${mimeType} latencyMs=${Date.now() - startedAt}`,
    );

    return {
      interactionId: interaction.id,
      videoBase64,
      mimeType,
      promptTokens,
      completionTokens,
      totalTokens,
    };
  } catch (err) {
    const safeErr = redactSecrets(err instanceof Error ? err.message : String(err));
    console.error(
      `[glaxyes:video] Upstream error model=${params.upstreamModel} latencyMs=${Date.now() - startedAt} error=${safeErr.slice(0, 400)}`,
    );
    throw err;
  }
}

