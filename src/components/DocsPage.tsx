import { Check, Copy, Terminal } from 'lucide-react';
import { useState } from 'react';
import type { ModelSpec } from '../types';

interface DocsPageProps {
  models: ModelSpec[];
  sampleApiKey?: string | null;
}

type CodeLang = 'curl' | 'node-fetch' | 'node-openai' | 'python';

export function DocsPage({ models, sampleApiKey }: DocsPageProps) {
  const [lang, setLang] = useState<CodeLang>('curl');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-service.run.app';
  const keyPlaceholder = sampleApiKey || 'glx_live_your_api_key_here';

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const snippets: Record<CodeLang, string> = {
    curl: `curl -X POST "${origin}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${keyPlaceholder}" \\
  -d '{
    "model": "gemini-4-hydrogen",
    "messages": [
      { "role": "system", "content": "You are a concise technical assistant." },
      { "role": "user", "content": "Explain how rate limiting works in REST APIs." }
    ],
    "stream": false
  }'`,

    'node-fetch': `const response = await fetch("${origin}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${keyPlaceholder}"
  },
  body: JSON.stringify({
    model: "gemini-4-hydrogen",
    messages: [
      { role: "system", content: "You are a concise technical assistant." },
      { role: "user", content: "Write a TypeScript helper to retry exponential backoff." }
    ],
    stream: false
  })
});

if (!response.ok) {
  const err = await response.json();
  throw new Error(err.error?.message || "API request failed");
}

const data = await response.json();
console.log(data.choices[0].message.content);
console.log("Tokens used:", data.usage.total_tokens);`,

    'node-openai': `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${keyPlaceholder}",
  baseURL: "${origin}/v1"
});

const completion = await client.chat.completions.create({
  model: "gemini-4-hydrogen",
  messages: [
    { role: "system", content: "You are a concise technical assistant." },
    { role: "user", content: "Summarize three benefits of Cloud Run." }
  ]
});

console.log(completion.choices[0].message.content);`,

    python: `import requests

response = requests.post(
    "${origin}/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer ${keyPlaceholder}",
    },
    json={
        "model": "gemini-4-hydrogen",
        "messages": [
            {"role": "system", "content": "You are a concise technical assistant."},
            {"role": "user", "content": "Generate a SQL query to aggregate daily usage."},
        ],
        "stream": False,
    },
    timeout=60,
)
response.raise_for_status()
data = response.json()
print(data["choices"][0]["message"]["content"])`,
  };

  const sampleResponse = `{
  "id": "chatcmpl-9f2a41bc8d3e4f0192a4c712",
  "object": "chat.completion",
  "created": 1795404675,
  "model": "gemini-4-hydrogen",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Rate limiting caps how many requests a client can send within a fixed window..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 24,
    "completion_tokens": 86,
    "total_tokens": 110
  }
}`;

  const streamingChunkExample = `data: {"id":"chatcmpl-9f2a","object":"chat.completion.chunk","created":1795404675,"model":"gemini-4-hydrogen","choices":[{"index":0,"delta":{"role":"assistant","content":"Rate "},"finish_reason":null}]}

data: {"id":"chatcmpl-9f2a","object":"chat.completion.chunk","created":1795404675,"model":"gemini-4-hydrogen","choices":[{"index":0,"delta":{"content":"limiting..."},"finish_reason":null}]}

data: {"id":"chatcmpl-9f2a","object":"chat.completion.chunk","created":1795404675,"model":"gemini-4-hydrogen","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":24,"completion_tokens":86,"total_tokens":110}}

data: [DONE]`;

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="border-b border-slate-200 pb-6">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Glaxyes AI REST API Documentation
        </h2>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
          Glaxyes AI exposes an OpenAI-compatible REST gateway backed by Google Gemini models.
          Authenticate every request with a server-issued Glaxyes API key via{' '}
          <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-mono">
            Authorization: Bearer
          </code>
          .
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>Base URL</span>
          <span aria-hidden="true">·</span>
          <code className="font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded">
            {origin}/v1
          </code>
          <span aria-hidden="true">·</span>
          <span>Protocol: HTTPS JSON / SSE</span>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              1. Quickstart: Chat Completions
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              POST {origin}/v1/chat/completions
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'curl', label: 'cURL' },
                { id: 'node-fetch', label: 'Node Fetch' },
                { id: 'node-openai', label: 'OpenAI SDK' },
                { id: 'python', label: 'Python' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLang(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  lang === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/70">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span>POST /v1/chat/completions</span>
            </div>
            <button
              type="button"
              onClick={() => copyText('snippet', snippets[lang])}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {copiedId === 'snippet' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 text-xs text-slate-200 font-mono overflow-x-auto leading-relaxed">
            <code>{snippets[lang]}</code>
          </pre>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">2. Supported Models</h3>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Model ID</th>
                  <th className="py-3 px-4">Aliases</th>
                  <th className="py-3 px-4">Context Window</th>
                  <th className="py-3 px-4">Capabilities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {models.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {m.id}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {m.aliases.join(', ')}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {m.contextWindow.toLocaleString()} tokens
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{m.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">3. Response Schema</h3>
          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/70">
              <span className="text-xs font-mono text-slate-400">200 OK · application/json</span>
              <button
                type="button"
                onClick={() => copyText('resp', sampleResponse)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                {copiedId === 'resp' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedId === 'resp' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-4 text-xs text-slate-200 font-mono overflow-x-auto leading-relaxed">
              <code>{sampleResponse}</code>
            </pre>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">4. Streaming SSE Format</h3>
          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/70">
              <span className="text-xs font-mono text-slate-400">
                stream: true · text/event-stream
              </span>
              <button
                type="button"
                onClick={() => copyText('sse', streamingChunkExample)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                {copiedId === 'sse' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedId === 'sse' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-4 text-xs text-slate-200 font-mono overflow-x-auto leading-relaxed">
              <code>{streamingChunkExample}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">
            Rate Limit Headers & Quotas
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Daily and monthly quotas are enforced atomically in UTC before forwarding to Gemini.
            Every response includes remaining quota headers:
          </p>
          <ul className="space-y-1.5 text-xs font-mono text-slate-700">
            <li>X-RateLimit-Limit-Day: 100</li>
            <li>X-RateLimit-Remaining-Day: 97</li>
            <li>X-RateLimit-Limit-Month: 2000</li>
            <li>X-RateLimit-Remaining-Month: 1997</li>
            <li>Retry-After: 3600 (returned on HTTP 429)</li>
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Standard Error Codes</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-100">
              <span className="font-mono font-semibold text-slate-900">400 Bad Request</span>
              <span className="text-slate-600 text-right">Invalid messages array or unknown model ID</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-100">
              <span className="font-mono font-semibold text-slate-900">401 Unauthorized</span>
              <span className="text-slate-600 text-right">Missing, malformed, or revoked glx_live_ key</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-100">
              <span className="font-mono font-semibold text-amber-700">429 Too Many Requests</span>
              <span className="text-slate-600 text-right">Daily or monthly account/key quota reached</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-1">
              <span className="font-mono font-semibold text-red-700">502 Bad Gateway</span>
              <span className="text-slate-600 text-right">Upstream Gemini error or missing server key</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
