import type { ApiServiceId, ServiceHealthRecord } from './db.ts';
import { getServiceHealthMap, SERVICE_PLAN_QUOTAS } from './db.ts';

export type ApiAvailabilityStatus = 'available' | 'error' | 'untested';

export interface MarketplaceApiSpec {
  id: ApiServiceId;
  name: string;
  shortDescription: string;
  whatItDoes: string;
  availability: ApiAvailabilityStatus;
  availabilityNote: string;
  lastTestedAt?: string | null;
  testedModel?: string | null;
  method: 'POST';
  endpoint: string;
  secondaryEndpoints?: Array<{ method: 'GET' | 'POST'; path: string; description: string }>;
  models: Array<{ id: string; label: string; contextOrSpec: string }>;
  pricing: {
    starter: string;
    pro: string;
    enterprise: string;
    unitPrice: string;
  };
  quotasByPlan: {
    starter: { daily_limit: number; monthly_limit: number };
    pro: { daily_limit: number; monthly_limit: number };
    enterprise: { daily_limit: number; monthly_limit: number };
  };
  requestExample: string;
  responseExample: string;
  jsExample: string;
  pythonExample: string;
  curlExample: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
}

function mapHealthToAvailability(
  health: ServiceHealthRecord | undefined,
  fallbackStatus: ApiAvailabilityStatus,
  defaultNote: string,
): {
  availability: ApiAvailabilityStatus;
  availabilityNote: string;
  lastTestedAt: string | null;
  testedModel: string | null;
} {
  if (!health) {
    return {
      availability: fallbackStatus,
      availabilityNote: defaultNote,
      lastTestedAt: null,
      testedModel: null,
    };
  }
  if (health.status === 'active') {
    return {
      availability: 'available',
      availabilityNote: health.tested_model
        ? `Verified active via live generation test (${health.tested_model}).`
        : defaultNote,
      lastTestedAt: health.last_tested_at,
      testedModel: health.tested_model,
    };
  }
  if (health.status === 'error') {
    return {
      availability: 'error',
      availabilityNote: health.last_error || 'Latest upstream generation test failed.',
      lastTestedAt: health.last_tested_at,
      testedModel: health.tested_model,
    };
  }
  return {
    availability: 'untested',
    availabilityNote: defaultNote,
    lastTestedAt: health.last_tested_at,
    testedModel: health.tested_model,
  };
}

export function getMarketplaceCatalog(origin = ''): MarketplaceApiSpec[] {
  const base = origin || 'https://your-glaxyes-host';
  const healthMap = getServiceHealthMap();

  const imageState = mapHealthToAvailability(
    healthMap.get('image'),
    'untested',
    'Connected to server-side Gemini Image SDK. Pending live generation test verification.',
  );
  const videoState = mapHealthToAvailability(
    healthMap.get('video'),
    'untested',
    'Connected to server-side Veo / Gemini Omni Flash Interactions API. Pending live generation test verification.',
  );

  return [
    {
      id: 'chat',
      name: 'Glaxyes Chat API',
      shortDescription: 'OpenAI-compatible multi-turn conversational completions with SSE streaming.',
      whatItDoes:
        'Routes conversational prompts, system instructions, and multi-turn message arrays to Google Gemini text models with real-time Server-Sent Events streaming and token telemetry.',
      availability: 'available',
      availabilityNote: 'Live and connected via server-side @google/genai SDK.',
      method: 'POST',
      endpoint: '/v1/chat/completions',
      secondaryEndpoints: [
        { method: 'GET', path: '/v1/models', description: 'List available Glaxyes AI models' },
      ],
      models: [
        { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', contextOrSpec: '1M context · Ultra-low latency (Default)' },
        { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', contextOrSpec: '1M context · Balanced' },
      ],
      pricing: {
        starter: 'Free · 100 req/day · 2,000 req/mo',
        pro: '$29/mo · 1,000 req/day · 25,000 req/mo',
        enterprise: 'Custom · 10,000 req/day · 250,000 req/mo',
        unitPrice: '$0.15 / 1M input tokens · $0.60 / 1M output tokens',
      },
      quotasByPlan: {
        starter: SERVICE_PLAN_QUOTAS.starter.chat,
        pro: SERVICE_PLAN_QUOTAS.pro.chat,
        enterprise: SERVICE_PLAN_QUOTAS.enterprise.chat,
      },
      parameters: [
        { name: 'model', type: 'string', required: false, description: 'gemini-3.1-flash-lite (default) or gemini-4-hydrogen' },
        { name: 'messages', type: 'array', required: true, description: 'Array of { role: "system" | "user" | "assistant", content }' },
        { name: 'stream', type: 'boolean', required: false, description: 'Stream response chunks via Server-Sent Events (default false)' },
        { name: 'max_tokens', type: 'number', required: false, description: 'Optional upper bound on output tokens' },
      ],
      requestExample: JSON.stringify(
        {
          model: 'gemini-4-hydrogen',
          messages: [
            { role: 'system', content: 'You are a concise cloud architect.' },
            { role: 'user', content: 'Explain zero-downtime blue/green deployments.' },
          ],
          stream: false,
        },
        null,
        2,
      ),
      responseExample: JSON.stringify(
        {
          id: 'chatcmpl-9f2a41bc8d3e4f0192a4c712',
          object: 'chat.completion',
          created: 1795404675,
          model: 'gemini-4-hydrogen',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Blue/green deployments maintain two identical production environments...',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 21, completion_tokens: 94, total_tokens: 115 },
        },
        null,
        2,
      ),
      jsExample: `const res = await fetch("${base}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_GLAXYES_KEY"
  },
  body: JSON.stringify({
    model: "gemini-4-hydrogen",
    messages: [{ role: "user", content: "Explain blue/green deployments." }]
  })
});
const data = await res.json();
console.log(data.choices[0].message.content);`,
      pythonExample: `import requests

res = requests.post(
    "${base}/v1/chat/completions",
    headers={"Authorization": "Bearer YOUR_GLAXYES_KEY"},
    json={
        "model": "gemini-4-hydrogen",
        "messages": [{"role": "user", "content": "Explain blue/green deployments."}],
    },
    timeout=60,
)
print(res.json()["choices"][0]["message"]["content"])`,
      curlExample: `curl -X POST "${base}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GLAXYES_KEY" \\
  -d '{"model":"gemini-4-hydrogen","messages":[{"role":"user","content":"Hello"}]}'`,
    },
    {
      id: 'coding',
      name: 'Glaxyes Coding API',
      shortDescription: 'Purpose-built endpoint for code generation, refactoring, debugging, and reviews.',
      whatItDoes:
        'Specializes Gemini reasoning for software engineering workflows: generates idiomatic code in any target language, refactors snippets, diagnoses bugs from stack traces, and returns clean code plus concise technical notes.',
      availability: 'available',
      availabilityNote: 'Live and connected via server-side @google/genai SDK.',
      method: 'POST',
      endpoint: '/v1/code/completions',
      models: [
        { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', contextOrSpec: '1M context · Rapid synthesis (Default)' },
        { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', contextOrSpec: '1M context · Deep reasoning' },
      ],
      pricing: {
        starter: 'Free · 75 req/day · 1,500 req/mo',
        pro: '$39/mo · 800 req/day · 20,000 req/mo',
        enterprise: 'Custom · 8,000 req/day · 200,000 req/mo',
        unitPrice: '$0.20 / 1M input tokens · $0.75 / 1M output tokens',
      },
      quotasByPlan: {
        starter: SERVICE_PLAN_QUOTAS.starter.coding,
        pro: SERVICE_PLAN_QUOTAS.pro.coding,
        enterprise: SERVICE_PLAN_QUOTAS.enterprise.coding,
      },
      parameters: [
        { name: 'model', type: 'string', required: false, description: 'gemini-3.1-flash-lite (default) or gemini-4-hydrogen' },
        { name: 'prompt', type: 'string', required: true, description: 'Engineering instruction or problem description' },
        { name: 'language', type: 'string', required: false, description: 'Target language (e.g. typescript, python, go, sql)' },
        { name: 'task', type: 'string', required: false, description: 'generate | refactor | debug | review | explain' },
        { name: 'context_code', type: 'string', required: false, description: 'Existing source code or error trace to analyze' },
      ],
      requestExample: JSON.stringify(
        {
          model: 'gemini-4-hydrogen',
          language: 'typescript',
          task: 'generate',
          prompt: 'Write a token-bucket rate limiter class with O(1) memory per key.',
        },
        null,
        2,
      ),
      responseExample: JSON.stringify(
        {
          id: 'codecmpl_4d1a88c0f2b94e7a8c12',
          object: 'code.completion',
          created: 1795404675,
          model: 'gemini-4-hydrogen',
          language: 'typescript',
          task: 'generate',
          output: 'export class TokenBucketLimiter {\n  // ...\n}',
          usage: { prompt_tokens: 38, completion_tokens: 184, total_tokens: 222 },
        },
        null,
        2,
      ),
      jsExample: `const res = await fetch("${base}/v1/code/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_GLAXYES_KEY"
  },
  body: JSON.stringify({
    model: "gemini-4-hydrogen",
    language: "typescript",
    task: "generate",
    prompt: "Write a debounce utility with AbortSignal support."
  })
});
const data = await res.json();
console.log(data.output);`,
      pythonExample: `import requests

res = requests.post(
    "${base}/v1/code/completions",
    headers={"Authorization": "Bearer YOUR_GLAXYES_KEY"},
    json={
        "model": "gemini-4-hydrogen",
        "language": "python",
        "task": "debug",
        "prompt": "Fix the race condition in this async worker.",
        "context_code": "async def worker(): ...",
    },
    timeout=60,
)
print(res.json()["output"])`,
      curlExample: `curl -X POST "${base}/v1/code/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GLAXYES_KEY" \\
  -d '{"model":"gemini-4-hydrogen","language":"typescript","task":"generate","prompt":"Write a binary search helper."}'`,
    },
    {
      id: 'voice',
      name: 'Glaxyes Voice API',
      shortDescription: 'Neural Text-to-Speech (WAV) and audio transcription powered by Gemini 3.8 & 3.5.',
      whatItDoes:
        'Converts written scripts into natural single-speaker or dual-speaker WAV audio with configurable voice personas, and transcribes uploaded audio clips (MP3, WAV, WebM) into accurate text.',
      availability: 'available',
      availabilityNote: 'Live and connected via Gemini 3.8 TTS & Gemini 3.5 Transcribe.',
      method: 'POST',
      endpoint: '/v1/audio/speech',
      secondaryEndpoints: [
        { method: 'POST', path: '/v1/audio/transcriptions', description: 'Transcribe MP3/WAV/WebM audio into text' },
      ],
      models: [
        { id: 'gemini-3.8-flash-lite-tts', label: 'Gemini 3.8 Flash Lite TTS', contextOrSpec: '24kHz mono WAV · Single speaker' },
        { id: 'gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS', contextOrSpec: '24kHz mono WAV · Voice design & dual-speaker' },
        { id: 'gemini-3.5-transcribe', label: 'Gemini 3.5 Transcribe', contextOrSpec: 'Audio-to-text transcription' },
      ],
      pricing: {
        starter: 'Free · 40 req/day · 600 req/mo',
        pro: '$49/mo · 400 req/day · 8,000 req/mo',
        enterprise: 'Custom · 4,000 req/day · 80,000 req/mo',
        unitPrice: '$0.012 / minute synthesized or transcribed',
      },
      quotasByPlan: {
        starter: SERVICE_PLAN_QUOTAS.starter.voice,
        pro: SERVICE_PLAN_QUOTAS.pro.voice,
        enterprise: SERVICE_PLAN_QUOTAS.enterprise.voice,
      },
      parameters: [
        { name: 'model', type: 'string', required: false, description: 'gemini-3.8-flash-lite-tts (default) or gemini-3.8-flash-tts' },
        { name: 'input', type: 'string', required: true, description: 'Text script to synthesize into speech' },
        { name: 'voice', type: 'string', required: false, description: 'Prebuilt voice: Kore | Puck | Charon | Fenrir | Zephyr' },
        { name: 'style', type: 'string', required: false, description: 'Optional delivery style (e.g. "Calm studio narrator")' },
      ],
      requestExample: JSON.stringify(
        {
          model: 'gemini-3.8-flash-lite-tts',
          input: 'Welcome to Glaxyes AI. Your deployment is healthy and serving traffic.',
          voice: 'Kore',
          style: 'Clear, calm technical narrator',
        },
        null,
        2,
      ),
      responseExample: JSON.stringify(
        {
          id: 'speech_81ba92e14c3d4a7081e4',
          object: 'audio.speech',
          created: 1795404675,
          model: 'gemini-3.8-flash-lite-tts',
          voice: 'Kore',
          mime_type: 'audio/wav',
          audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEA...',
          usage: { prompt_tokens: 18, completion_tokens: 240, total_tokens: 258 },
        },
        null,
        2,
      ),
      jsExample: `const res = await fetch("${base}/v1/audio/speech", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_GLAXYES_KEY"
  },
  body: JSON.stringify({
    model: "gemini-3.8-flash-lite-tts",
    input: "Hello from Glaxyes Voice API.",
    voice: "Kore"
  })
});
const { audio_base64, mime_type } = await res.json();
const audio = new Audio(\`data:\${mime_type};base64,\${audio_base64}\`);
audio.play();`,
      pythonExample: `import base64, requests

res = requests.post(
    "${base}/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_GLAXYES_KEY"},
    json={
        "model": "gemini-3.8-flash-lite-tts",
        "input": "Hello from Glaxyes Voice API.",
        "voice": "Kore",
    },
    timeout=60,
)
data = res.json()
with open("output.wav", "wb") as f:
    f.write(base64.b64decode(data["audio_base64"]))`,
      curlExample: `curl -X POST "${base}/v1/audio/speech" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GLAXYES_KEY" \\
  -d '{"model":"gemini-3.8-flash-lite-tts","input":"Hello from Glaxyes AI.","voice":"Kore"}'`,
    },
    {
      id: 'vision',
      name: 'Glaxyes Vision API',
      shortDescription: 'Multimodal image understanding, OCR extraction, and visual QA.',
      whatItDoes:
        'Analyzes PNG, JPEG, or WebP images alongside natural-language prompts to extract structured text, inspect UI screenshots, describe scenes, and answer visual questions.',
      availability: 'available',
      availabilityNote: 'Live and connected via server-side @google/genai multimodal API.',
      method: 'POST',
      endpoint: '/v1/vision/analyze',
      models: [
        { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', contextOrSpec: 'Fast OCR & multimodal QA (Default)' },
        { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', contextOrSpec: 'Multimodal vision + reasoning' },
      ],
      pricing: {
        starter: 'Free · 50 req/day · 1,000 req/mo',
        pro: '$35/mo · 500 req/day · 12,000 req/mo',
        enterprise: 'Custom · 5,000 req/day · 120,000 req/mo',
        unitPrice: '$0.18 / 1M multimodal input tokens',
      },
      quotasByPlan: {
        starter: SERVICE_PLAN_QUOTAS.starter.vision,
        pro: SERVICE_PLAN_QUOTAS.pro.vision,
        enterprise: SERVICE_PLAN_QUOTAS.enterprise.vision,
      },
      parameters: [
        { name: 'model', type: 'string', required: false, description: 'gemini-3.1-flash-lite (default) or gemini-4-hydrogen' },
        { name: 'prompt', type: 'string', required: true, description: 'Question or extraction instruction about the image' },
        { name: 'image_base64', type: 'string', required: true, description: 'Base64-encoded image bytes (without data URI prefix)' },
        { name: 'mime_type', type: 'string', required: true, description: 'image/png, image/jpeg, or image/webp' },
      ],
      requestExample: JSON.stringify(
        {
          model: 'gemini-4-hydrogen',
          prompt: 'Extract all visible labels, metrics, and colors from this diagram.',
          mime_type: 'image/png',
          image_base64: 'iVBORw0KGgoAAAANSUhEUgAA...',
        },
        null,
        2,
      ),
      responseExample: JSON.stringify(
        {
          id: 'vision_7c3e12a9b40148f3a119',
          object: 'vision.analysis',
          created: 1795404675,
          model: 'gemini-4-hydrogen',
          analysis: 'The image displays a system architecture diagram with three blue service nodes...',
          usage: { prompt_tokens: 280, completion_tokens: 64, total_tokens: 344 },
        },
        null,
        2,
      ),
      jsExample: `const res = await fetch("${base}/v1/vision/analyze", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_GLAXYES_KEY"
  },
  body: JSON.stringify({
    model: "gemini-4-hydrogen",
    prompt: "Describe what is shown in this image.",
    mime_type: "image/png",
    image_base64: base64PngString
  })
});
const data = await res.json();
console.log(data.analysis);`,
      pythonExample: `import base64, requests

with open("diagram.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

res = requests.post(
    "${base}/v1/vision/analyze",
    headers={"Authorization": "Bearer YOUR_GLAXYES_KEY"},
    json={
        "model": "gemini-4-hydrogen",
        "prompt": "Describe what is shown in this image.",
        "mime_type": "image/png",
        "image_base64": b64,
    },
    timeout=60,
)
print(res.json()["analysis"])`,
      curlExample: `curl -X POST "${base}/v1/vision/analyze" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GLAXYES_KEY" \\
  -d '{"model":"gemini-4-hydrogen","prompt":"Describe this image","mime_type":"image/png","image_base64":"..."}'`,
    },
    {
      id: 'image',
      name: 'Glaxyes Image Generation API',
      shortDescription: 'Text-to-image synthesis and image editing via Gemini 3.1 Flash Image.',
      whatItDoes:
        'Generates high-resolution images from text prompts or edits reference images with configurable aspect ratios and resolution presets, returning secure server-hosted media URLs and optional base64 output.',
      availability: imageState.availability,
      availabilityNote: imageState.availabilityNote,
      lastTestedAt: imageState.lastTestedAt,
      testedModel: imageState.testedModel,
      method: 'POST',
      endpoint: '/v1/images/generations',
      secondaryEndpoints: [
        { method: 'GET', path: '/v1/media/:id', description: 'Retrieve securely stored generated image bytes' },
      ],
      models: [
        { id: 'gemini-3.1-flash-lite-image', label: 'Gemini 3.1 Flash Lite Image', contextOrSpec: 'Default · Standard 1:1 to 21:9 generation & editing' },
        { id: 'gemini-nano-banana-2.1', label: 'Gemini Nano Banana 2.1', contextOrSpec: '1K / 2K / 4K output & extended 1:4–8:1 ratios' },
        { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image', contextOrSpec: 'Pro 1K / 2K / 4K output resolution' },
      ],
      pricing: {
        starter: '20 req/day · 300 req/mo',
        pro: '$59/mo · 250 req/day · 5,000 req/mo',
        enterprise: 'Custom · 2,500 req/day · 50,000 req/mo',
        unitPrice: '$0.039 / generated image (1K)',
      },
      quotasByPlan: {
        starter: SERVICE_PLAN_QUOTAS.starter.image,
        pro: SERVICE_PLAN_QUOTAS.pro.image,
        enterprise: SERVICE_PLAN_QUOTAS.enterprise.image,
      },
      parameters: [
        { name: 'prompt', type: 'string', required: true, description: 'Detailed visual generation or editing prompt' },
        { name: 'model', type: 'string', required: false, description: 'gemini-3.1-flash-lite-image (default), gemini-nano-banana-2.1, or gemini-3-pro-image' },
        { name: 'aspect_ratio', type: 'string', required: false, description: '1:1 | 2:3 | 3:2 | 3:4 | 4:3 | 4:5 | 5:4 | 9:16 | 16:9 | 21:9 (plus 1:4, 1:8, 4:1, 8:1 on Nano Banana / Pro)' },
        { name: 'image_size', type: 'string', required: false, description: '1K | 2K | 4K (supported on gemini-nano-banana-2.1 and gemini-3-pro-image)' },
        { name: 'output_format', type: 'string', required: false, description: 'both (default) | url | b64_json' },
        { name: 'image_base64', type: 'string', required: false, description: 'Optional base64 input image for image-to-image editing' },
        { name: 'mime_type', type: 'string', required: false, description: 'image/png | image/jpeg | image/webp (when image_base64 provided)' },
      ],
      requestExample: JSON.stringify(
        {
          model: 'gemini-3.1-flash-lite-image',
          prompt: 'Isometric studio render of a brushed aluminum server rack with subtle blue LEDs.',
          aspect_ratio: '16:9',
          output_format: 'both',
        },
        null,
        2,
      ),
      responseExample: JSON.stringify(
        {
          id: 'img_55e2c90b11a34920b9f1',
          object: 'image.generation',
          created: 1795404675,
          model: 'gemini-3.1-flash-lite-image',
          data: [
            {
              media_id: 'med_8f1c902a14b54a88',
              url: `${base}/v1/media/med_8f1c902a14b54a88?token=glx_med_...`,
              mime_type: 'image/png',
              size_bytes: 428190,
              b64_json: 'iVBORw0KGgoAAAANSUhEUgAA...',
            },
          ],
          usage: { prompt_tokens: 19, completion_tokens: 1024, total_tokens: 1043 },
        },
        null,
        2,
      ),
      jsExample: `const res = await fetch("${base}/v1/images/generations", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_GLAXYES_KEY"
  },
  body: JSON.stringify({
    model: "gemini-3.1-flash-lite-image",
    prompt: "Minimalist studio photograph of a ceramic espresso cup.",
    aspect_ratio: "1:1",
    output_format: "both"
  })
});
const data = await res.json();
console.log(data.data[0].url);`,
      pythonExample: `import requests

res = requests.post(
    "${base}/v1/images/generations",
    headers={"Authorization": "Bearer YOUR_GLAXYES_KEY"},
    json={
        "model": "gemini-3.1-flash-lite-image",
        "prompt": "Minimalist studio photograph of a ceramic espresso cup.",
        "aspect_ratio": "1:1",
        "output_format": "both",
    },
    timeout=90,
)
print(res.json()["data"][0]["url"])`,
      curlExample: `curl -X POST "${base}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GLAXYES_KEY" \\
  -d '{"model":"gemini-3.1-flash-lite-image","prompt":"Isometric server rack","aspect_ratio":"16:9"}'`,
    },
    {
      id: 'video',
      name: 'Glaxyes Video Generation API',
      shortDescription: 'Asynchronous text-to-video and image-to-video generation powered by Veo / Gemini Omni Flash.',
      whatItDoes:
        'Queues asynchronous MP4 video generation jobs from text prompts or starting frames via Google Gemini Omni Flash (Veo), tracks job status via GET /v1/videos/jobs/:id, and stores completed MP4 files securely on the server.',
      availability: videoState.availability,
      availabilityNote: videoState.availabilityNote,
      lastTestedAt: videoState.lastTestedAt,
      testedModel: videoState.testedModel,
      method: 'POST',
      endpoint: '/v1/videos/generations',
      secondaryEndpoints: [
        { method: 'GET', path: '/v1/videos/jobs/:id', description: 'Poll asynchronous video job status and retrieve MP4 URL' },
        { method: 'GET', path: '/v1/media/:id', description: 'Stream or download securely stored MP4 video asset' },
      ],
      models: [
        { id: 'gemini-omni-1.2-flash', label: 'Gemini Omni 1.2 Flash (Veo)', contextOrSpec: '3s–15s MP4 · 360p to 4K · Text & Image-to-Video' },
      ],
      pricing: {
        starter: '5 req/day · 50 req/mo',
        pro: '$129/mo · 50 req/day · 600 req/mo',
        enterprise: 'Custom · 500 req/day · 6,000 req/mo',
        unitPrice: '$0.25 / 5s 720p clip',
      },
      quotasByPlan: {
        starter: SERVICE_PLAN_QUOTAS.starter.video,
        pro: SERVICE_PLAN_QUOTAS.pro.video,
        enterprise: SERVICE_PLAN_QUOTAS.enterprise.video,
      },
      parameters: [
        { name: 'prompt', type: 'string', required: true, description: 'Scene motion, camera movement, and visual direction prompt' },
        { name: 'model', type: 'string', required: false, description: 'gemini-omni-1.2-flash (default; aliases: veo, veo-lite)' },
        { name: 'aspect_ratio', type: 'string', required: false, description: '16:9 (default) or 9:16' },
        { name: 'duration', type: 'string', required: false, description: '3s to 15s (default 5s)' },
        { name: 'resolution', type: 'string', required: false, description: '360p | 720p (default) | 1080p | 4k' },
        { name: 'image_base64', type: 'string', required: false, description: 'Optional base64 starting frame image for image-to-video' },
        { name: 'mime_type', type: 'string', required: false, description: 'image/png | image/jpeg | image/webp (when image_base64 provided)' },
      ],
      requestExample: JSON.stringify(
        {
          model: 'gemini-omni-1.2-flash',
          prompt: 'Slow aerial pan over misty alpine ridges at sunrise.',
          aspect_ratio: '16:9',
          duration: '5s',
          resolution: '720p',
        },
        null,
        2,
      ),
      responseExample: JSON.stringify(
        {
          id: 'vidjob_99c4d1a07e214483a001',
          object: 'video.job',
          status: 'succeeded',
          model: 'gemini-omni-1.2-flash',
          mode: 'text_to_video',
          aspect_ratio: '16:9',
          duration: '5s',
          resolution: '720p',
          mime_type: 'video/mp4',
          size_bytes: 2841920,
          video_url: `${base}/v1/media/med_31a04bc1e29d477a?token=glx_med_...`,
          poll_url: '/v1/videos/jobs/vidjob_99c4d1a07e214483a001',
        },
        null,
        2,
      ),
      jsExample: `const createRes = await fetch("${base}/v1/videos/generations", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_GLAXYES_KEY"
  },
  body: JSON.stringify({
    model: "gemini-omni-1.2-flash",
    prompt: "Slow aerial pan over misty alpine ridges at sunrise.",
    aspect_ratio: "16:9",
    duration: "5s",
    resolution: "720p"
  })
});
const job = await createRes.json();

// Poll GET /v1/videos/jobs/:id until succeeded or failed
let status = job;
while (status.status === "queued" || status.status === "processing") {
  await new Promise((r) => setTimeout(r, 3000));
  const poll = await fetch(\`${base}/v1/videos/jobs/\${job.id}\`, {
    headers: { "Authorization": "Bearer YOUR_GLAXYES_KEY" }
  });
  status = await poll.json();
}
console.log(status.video_url || status.error);`,
      pythonExample: `import time, requests

headers = {"Authorization": "Bearer YOUR_GLAXYES_KEY"}
job = requests.post(
    "${base}/v1/videos/generations",
    headers=headers,
    json={
        "model": "gemini-omni-1.2-flash",
        "prompt": "Slow aerial pan over misty alpine ridges at sunrise.",
        "aspect_ratio": "16:9",
        "duration": "5s",
        "resolution": "720p",
    },
    timeout=30,
).json()

while job["status"] in ("queued", "processing"):
    time.sleep(3)
    job = requests.get(f"${base}/v1/videos/jobs/{job['id']}", headers=headers, timeout=30).json()

print(job.get("video_url") or job.get("error"))`,
      curlExample: `curl -X POST "${base}/v1/videos/generations" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GLAXYES_KEY" \\
  -d '{"model":"gemini-omni-1.2-flash","prompt":"Alpine sunrise aerial pan","duration":"5s","resolution":"720p"}'

# Then poll job status:
curl -H "Authorization: Bearer YOUR_GLAXYES_KEY" "${base}/v1/videos/jobs/JOB_ID"`,
    },
  ];
}
