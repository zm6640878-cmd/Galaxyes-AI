import { KeyRound, Plus, RotateCcw, Send } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { ModelSpec } from '../types';

interface PlaygroundPageProps {
  models: ModelSpec[];
  sessionApiKey: string;
  onSessionApiKeyChange: (key: string) => void;
  onRefreshDashboard: () => Promise<void>;
}

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
}

export function PlaygroundPage({
  models,
  sessionApiKey,
  onSessionApiKeyChange,
  onRefreshDashboard,
}: PlaygroundPageProps) {
  const [selectedModel, setSelectedModel] = useState<string>(
    models[0]?.id || 'gemini-4-hydrogen',
  );
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful, concise technical assistant.',
  );
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [promptInput, setPromptInput] = useState('');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastHttpStatus, setLastHttpStatus] = useState<number | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastHeaders, setLastHeaders] = useState<Record<string, string>>({});
  const [lastRawResponse, setLastRawResponse] = useState<string>('');

  const handleMintKey = async () => {
    setCreatingKey(true);
    setError(null);
    try {
      const label = `Playground ${new Date().toISOString().slice(11, 19)}`;
      const res = await api.createKey({ name: label });
      onSessionApiKeyChange(res.rawKey);
      await onRefreshDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create Glaxyes API key.');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed || sending) return;

    if (!sessionApiKey.trim().startsWith('glx_live_')) {
      setError('Provide a valid Glaxyes API key (glx_live_...) or click "Create & Load Key".');
      return;
    }

    setError(null);
    setSending(true);

    const nextHistory: ChatEntry[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setPromptInput('');

    const apiMessages = [
      ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
      ...nextHistory.map((m) => ({ role: m.role, content: m.content })),
    ];

    const payload = {
      model: selectedModel,
      messages: apiMessages,
      stream: streamEnabled,
    };

    const startedAt = performance.now();

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionApiKey.trim()}`,
        },
        body: JSON.stringify(payload),
      });

      const collectedHeaders: Record<string, string> = {};
      [
        'x-ratelimit-limit-day',
        'x-ratelimit-remaining-day',
        'x-ratelimit-limit-month',
        'x-ratelimit-remaining-month',
      ].forEach((h) => {
        const val = res.headers.get(h);
        if (val !== null) collectedHeaders[h] = val;
      });
      setLastHeaders(collectedHeaders);
      setLastHttpStatus(res.status);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setLastLatencyMs(Math.round(performance.now() - startedAt));
        setLastRawResponse(JSON.stringify(errJson, null, 2));
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        setError(errMsg);
        setSending(false);
        await onRefreshDashboard();
        return;
      }

      if (streamEnabled && res.body) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        const rawEvents: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const cleaned = line.trim();
            if (!cleaned.startsWith('data:')) continue;
            const dataPart = cleaned.slice(5).trim();
            if (dataPart === '[DONE]') {
              rawEvents.push('data: [DONE]');
              continue;
            }
            rawEvents.push(dataPart);
            try {
              const parsed = JSON.parse(dataPart);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') {
                fullContent += delta;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: fullContent };
                  return updated;
                });
              } else if (parsed?.error?.message) {
                setError(parsed.error.message);
              }
            } catch {
              // skip partial JSON chunk
            }
          }
        }
        setLastLatencyMs(Math.round(performance.now() - startedAt));
        setLastRawResponse(rawEvents.slice(-3).join('\n\n'));
      } else {
        const data = await res.json();
        setLastLatencyMs(Math.round(performance.now() - startedAt));
        setLastRawResponse(JSON.stringify(data, null, 2));
        const reply = data?.choices?.[0]?.message?.content ?? '';
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      }

      await onRefreshDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">API Playground</h2>
          <p className="text-xs text-slate-500 mt-1">
            Execute live requests against <code className="font-mono text-slate-800">POST /v1/chat/completions</code> using your Glaxyes AI key.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setError(null);
            setLastRawResponse('');
            setLastHttpStatus(null);
            setLastLatencyMs(null);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Thread</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
        <div className="lg:col-span-5">
          <label htmlFor="pg-key" className="block text-xs font-medium text-slate-700 mb-1.5">
            Glaxyes API Key (Bearer Token)
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="pg-key"
                type="password"
                value={sessionApiKey}
                onChange={(e) => onSessionApiKeyChange(e.target.value)}
                placeholder="glx_live_..."
                className="w-full h-10 pl-8 pr-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <button
              type="button"
              disabled={creatingKey}
              onClick={handleMintKey}
              className="h-10 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{creatingKey ? 'Minting...' : 'Create & Load Key'}</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-3">
          <label htmlFor="pg-model" className="block text-xs font-medium text-slate-700 mb-1.5">
            Model
          </label>
          <select
            id="pg-model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
            <option value="glaxyes-4-hydrogen">glaxyes-4-hydrogen (alias)</option>
            <option value="glaxyes-flash-lite">glaxyes-flash-lite (alias)</option>
          </select>
        </div>

        <div className="lg:col-span-4 flex items-center justify-between gap-4 h-10 px-3 rounded-lg border border-slate-200 bg-slate-50/70">
          <span className="text-xs font-medium text-slate-700">Stream Response (SSE)</span>
          <button
            type="button"
            role="switch"
            aria-checked={streamEnabled}
            onClick={() => setStreamEnabled((prev) => !prev)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              streamEnabled ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                streamEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[460px]">
          <div className="p-4 border-b border-slate-200">
            <label htmlFor="pg-system" className="block text-xs font-medium text-slate-600 mb-1">
              System Instruction
            </label>
            <input
              id="pg-system"
              type="text"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[380px]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <p className="text-sm font-medium text-slate-900">Ready to test /v1/chat/completions</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Send a prompt below to call your Node.js REST gateway backed by Google Gemini and observe live quota headers.
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <span className="text-[11px] font-medium text-slate-400 mb-1">
                    {msg.role === 'user' ? 'User' : `Assistant · ${selectedModel}`}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    {msg.content || (sending && msg.role === 'assistant' ? 'Streaming...' : '')}
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSend} className="p-4 border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Write a prompt to test /v1/chat/completions..."
              className="flex-1 h-10 px-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={sending || !promptInput.trim()}
              className="h-10 inline-flex items-center gap-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </form>
        </div>

        <div className="lg:col-span-5 bg-slate-950 text-slate-200 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300">HTTP Inspector</span>
            {lastHttpStatus !== null && (
              <span
                className={`tabular-nums ${
                  lastHttpStatus < 400 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                HTTP {lastHttpStatus} · {lastLatencyMs ?? 0}ms
              </span>
            )}
          </div>

          <div className="p-4 border-b border-slate-800 space-y-1.5">
            <div className="text-[11px] font-medium text-slate-400">Rate Limit Response Headers</div>
            {Object.keys(lastHeaders).length === 0 ? (
              <div className="text-xs font-mono text-slate-500">
                Headers will appear after sending a request.
              </div>
            ) : (
              <div className="space-y-1 text-xs font-mono tabular-nums">
                {Object.entries(lastHeaders).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">{k}</span>
                    <span className="text-blue-300">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 p-4 overflow-auto">
            <div className="text-[11px] font-medium text-slate-400 mb-2">
              {streamEnabled ? 'Last SSE Chunks' : 'Raw JSON Response'}
            </div>
            <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
              <code>
                {lastRawResponse ||
                  '// Send a completion request to inspect the raw JSON / SSE payload.'}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
