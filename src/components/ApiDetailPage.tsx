import {
  ArrowLeft,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Film,
  Image,
  KeyRound,
  MessageSquare,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api } from '../api';
import type {
  ApiKeyItem,
  ApiServiceId,
  MarketplaceApiSpec,
  ServiceUsageSummary,
  UsageLogItem,
  UserProfile,
} from '../types';

interface ApiDetailPageProps {
  spec: MarketplaceApiSpec;
  user: UserProfile | null;
  keys: ApiKeyItem[];
  serviceStats?: ServiceUsageSummary;
  logs: UsageLogItem[];
  sessionApiKey: string;
  onSessionApiKeyChange: (key: string) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onRequireAuth?: () => void;
}

type DetailTab = 'docs' | 'playground' | 'keys' | 'usage';
type CodeExampleLang = 'js' | 'python' | 'curl';

const SERVICE_ICONS: Record<ApiServiceId, typeof MessageSquare> = {
  chat: MessageSquare,
  image: Image,
  video: Film,
  coding: Code2,
  voice: Mic,
  vision: Eye,
};

export function ApiDetailPage({
  spec,
  user,
  keys,
  serviceStats,
  logs,
  sessionApiKey,
  onSessionApiKeyChange,
  onBack,
  onRefresh,
  onRequireAuth,
}: ApiDetailPageProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('docs');
  const [codeLang, setCodeLang] = useState<CodeExampleLang>('js');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scoped key creation state
  const [newKeyName, setNewKeyName] = useState(`${spec.name.replace('Glaxyes ', '')} Key`);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ name: string; rawKey: string } | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);

  // Playground state
  const [pgModel, setPgModel] = useState(spec.models[0]?.id || '');
  const [pgRunning, setPgRunning] = useState(false);
  const [pgError, setPgError] = useState<string | null>(null);
  const [pgHttpStatus, setPgHttpStatus] = useState<number | null>(null);
  const [pgLatency, setPgLatency] = useState<number | null>(null);
  const [pgHeaders, setPgHeaders] = useState<Record<string, string>>({});
  const [pgRawJson, setPgRawJson] = useState('');

  // Chat playground
  const [chatPrompt, setChatPrompt] = useState('Explain idempotency keys in REST APIs in 3 bullets.');
  const [chatReply, setChatReply] = useState('');

  // Coding playground
  const [codeLanguage, setCodeLanguage] = useState('typescript');
  const [codeTask, setCodeTask] = useState('generate');
  const [codePrompt, setCodePrompt] = useState('Write a clean retry helper with exponential backoff.');
  const [codeContext, setCodeContext] = useState('');
  const [codeOutput, setCodeOutput] = useState('');

  // Voice playground
  const [voiceMode, setVoiceMode] = useState<'tts' | 'transcribe'>('tts');
  const [ttsInput, setTtsInput] = useState('Glaxyes Voice API is connected and synthesizing live WAV audio.');
  const [ttsVoice, setTtsVoice] = useState('Kore');
  const [ttsStyle, setTtsStyle] = useState('Clear, calm studio narrator');
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsAudioBase64, setTtsAudioBase64] = useState<string>('');
  const [transcribeMime, setTranscribeMime] = useState('audio/wav');
  const [transcribeBase64, setTranscribeBase64] = useState('');
  const [transcribeOutput, setTranscribeOutput] = useState('');

  // Vision playground
  const [visionPrompt, setVisionPrompt] = useState('Describe the shapes, colors, and text visible in this image.');
  const [visionMime, setVisionMime] = useState('image/png');
  const [visionBase64, setVisionBase64] = useState('');
  const [visionPreviewUrl, setVisionPreviewUrl] = useState('');
  const [visionOutput, setVisionOutput] = useState('');

  // Image generation playground
  const [imgPrompt, setImgPrompt] = useState(
    'Isometric studio render of a brushed aluminum AI server rack with subtle cobalt accent lighting.',
  );
  const [imgAspectRatio, setImgAspectRatio] = useState('16:9');
  const [imgSize, setImgSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [imgOutputFormat, setImgOutputFormat] = useState<'both' | 'url' | 'b64_json'>('both');
  const [imgRefBase64, setImgRefBase64] = useState('');
  const [imgRefMime, setImgRefMime] = useState('image/png');
  const [imgRefPreview, setImgRefPreview] = useState('');
  const [imgResultUrl, setImgResultUrl] = useState('');
  const [imgResultMime, setImgResultMime] = useState('image/png');
  const [imgResultSizeBytes, setImgResultSizeBytes] = useState<number | null>(null);
  const [imgResultNote, setImgResultNote] = useState('');

  // Video generation playground
  const [vidMode, setVidMode] = useState<'text_to_video' | 'image_to_video'>('text_to_video');
  const [vidPrompt, setVidPrompt] = useState(
    'Slow aerial drone pan over misty alpine ridges at sunrise, cinematic golden hour light.',
  );
  const [vidAspectRatio, setVidAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [vidDuration, setVidDuration] = useState<'5s' | '8s' | '10s' | '15s'>('5s');
  const [vidResolution, setVidResolution] = useState<'360p' | '720p' | '1080p' | '4k'>('720p');
  const [vidRefBase64, setVidRefBase64] = useState('');
  const [vidRefMime, setVidRefMime] = useState('image/png');
  const [vidRefPreview, setVidRefPreview] = useState('');
  const [vidJobId, setVidJobId] = useState('');
  const [vidJobStatus, setVidJobStatus] = useState<'' | 'queued' | 'processing' | 'succeeded' | 'failed'>('');
  const [vidResultUrl, setVidResultUrl] = useState('');
  const [vidResultSizeBytes, setVidResultSizeBytes] = useState<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setPgModel(spec.models[0]?.id || '');
    setNewKeyName(`${spec.name.replace('Glaxyes ', '')} Key`);
    setPgError(null);
    setPgRawJson('');
    setPgHttpStatus(null);
    setPgLatency(null);
    setPgHeaders({});
  }, [spec.id]);

  useEffect(() => {
    if (
      spec.id === 'image' &&
      pgModel !== 'gemini-nano-banana-2.1' &&
      pgModel !== 'gemini-3-pro-image' &&
      ['1:4', '1:8', '4:1', '8:1'].includes(imgAspectRatio)
    ) {
      setImgAspectRatio('1:1');
    }
  }, [spec.id, pgModel, imgAspectRatio]);

  const Icon = SERVICE_ICONS[spec.id];
  const statusLabel =
    spec.availability === 'available'
      ? 'Active'
      : spec.availability === 'error'
        ? 'Error'
        : 'Untested';
  const statusColorClass =
    spec.availability === 'available'
      ? 'text-emerald-700'
      : spec.availability === 'error'
        ? 'text-red-700'
        : 'text-amber-700';

  // Only keys applicable to this service
  const serviceKeys = keys.filter(
    (k) => k.service_scope === spec.id || k.service_scope === 'all',
  );
  // Only logs belonging to this service
  const serviceLogs = logs.filter((l) => l.service === spec.id);

  const copyText = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleGenerateScopedKey = async (autoLoadPlayground = true) => {
    if (!user) {
      onRequireAuth?.();
      return;
    }
    setCreatingKey(true);
    setKeyError(null);
    try {
      const label = newKeyName.trim() || `${spec.id.toUpperCase()} Key`;
      const res = await api.createKey({
        name: label,
        service_scope: spec.id,
      });
      setRevealedKey({ name: res.key.name, rawKey: res.rawKey });
      if (autoLoadPlayground) {
        onSessionApiKeyChange(res.rawKey);
      }
      await onRefresh();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to generate API key.');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleToggleKeyStatus = async (k: ApiKeyItem) => {
    setBusyKeyId(k.id);
    try {
      await api.updateKey(k.id, { status: k.status === 'active' ? 'revoked' : 'active' });
      await onRefresh();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to update API key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleDeleteKey = async (k: ApiKeyItem) => {
    setBusyKeyId(k.id);
    try {
      await api.deleteKey(k.id);
      await onRefresh();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to delete API key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const generateSampleDiagramPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, 480, 240);
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(36, 80, 120, 76);
    ctx.fillStyle = '#16A34A';
    ctx.fillRect(324, 80, 120, 76);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(156, 118);
    ctx.lineTo(324, 118);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('CLIENT', 68, 123);
    ctx.fillText('GLAXYES', 350, 123);
    ctx.fillStyle = '#93C5FD';
    ctx.font = '13px monospace';
    ctx.fillText('POST /v1/vision/analyze', 148, 52);

    const dataUrl = canvas.toDataURL('image/png');
    setVisionPreviewUrl(dataUrl);
    setVisionMime('image/png');
    setVisionBase64(dataUrl.split(',')[1] || '');
  };

  const handleImageUploadForTarget = (
    e: ChangeEvent<HTMLInputElement>,
    target: 'vision' | 'image_ref' | 'video_ref',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const [header, b64] = result.split(',');
      const mimeMatch = header?.match(/data:(.*?);base64/);
      const mime = mimeMatch?.[1] || file.type || 'image/png';
      if (target === 'vision') {
        setVisionPreviewUrl(result);
        setVisionMime(mime);
        setVisionBase64(b64 || '');
      } else if (target === 'image_ref') {
        setImgRefPreview(result);
        setImgRefMime(mime);
        setImgRefBase64(b64 || '');
      } else {
        setVidRefPreview(result);
        setVidRefMime(mime);
        setVidRefBase64(b64 || '');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const [header, b64] = result.split(',');
      const mimeMatch = header?.match(/data:(.*?);base64/);
      setTranscribeMime(mimeMatch?.[1] || file.type || 'audio/wav');
      setTranscribeBase64(b64 || '');
    };
    reader.readAsDataURL(file);
  };

  const executePlayground = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth?.();
      return;
    }
    if (!sessionApiKey.trim().startsWith('glx_live_')) {
      setPgError('Provide a valid Glaxyes API key (glx_live_...) or click "Generate Key".');
      return;
    }

    setPgRunning(true);
    setPgError(null);
    const started = performance.now();

    let url = spec.endpoint;
    let body: Record<string, unknown> = {};

    if (spec.id === 'chat') {
      body = {
        model: pgModel,
        messages: [{ role: 'user', content: chatPrompt }],
        stream: false,
      };
    } else if (spec.id === 'coding') {
      body = {
        model: pgModel,
        language: codeLanguage,
        task: codeTask,
        prompt: codePrompt,
        ...(codeContext.trim() ? { context_code: codeContext } : {}),
      };
    } else if (spec.id === 'voice') {
      if (voiceMode === 'tts') {
        url = '/v1/audio/speech';
        body = {
          model: pgModel === 'gemini-3.5-transcribe' ? 'gemini-3.8-flash-lite-tts' : pgModel,
          input: ttsInput,
          voice: ttsVoice,
          ...(ttsStyle.trim() ? { style: ttsStyle } : {}),
        };
      } else {
        url = '/v1/audio/transcriptions';
        if (!transcribeBase64) {
          setPgError('Upload an audio file or synthesize a TTS clip first to transcribe it.');
          setPgRunning(false);
          return;
        }
        body = {
          model: 'gemini-3.5-transcribe',
          audio_base64: transcribeBase64,
          mime_type: transcribeMime,
        };
      }
    } else if (spec.id === 'vision') {
      if (!visionBase64) {
        setPgError('Upload an image or click "Load Sample Diagram PNG" first.');
        setPgRunning(false);
        return;
      }
      body = {
        model: pgModel,
        prompt: visionPrompt,
        mime_type: visionMime,
        image_base64: visionBase64,
      };
    } else if (spec.id === 'image') {
      url = '/v1/images/generations';
      body = {
        model: pgModel,
        prompt: imgPrompt,
        aspect_ratio: imgAspectRatio,
        output_format: imgOutputFormat,
        ...(pgModel === 'gemini-nano-banana-2.1' || pgModel === 'gemini-3-pro-image'
          ? { image_size: imgSize }
          : {}),
        ...(imgRefBase64 ? { image_base64: imgRefBase64, mime_type: imgRefMime } : {}),
      };
      setImgResultUrl('');
      setImgResultSizeBytes(null);
      setImgResultNote('');
    } else if (spec.id === 'video') {
      url = '/v1/videos/generations';
      if (vidMode === 'image_to_video' && !vidRefBase64) {
        setPgError('Upload a starting frame image or switch to Text-to-Video mode.');
        setPgRunning(false);
        return;
      }
      body = {
        model: pgModel,
        prompt: vidPrompt,
        aspect_ratio: vidAspectRatio,
        duration: vidDuration,
        resolution: vidResolution,
        ...(vidMode === 'image_to_video' && vidRefBase64
          ? { image_base64: vidRefBase64, mime_type: vidRefMime }
          : {}),
      };
      setVidJobId('');
      setVidJobStatus('');
      setVidResultUrl('');
      setVidResultSizeBytes(null);
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionApiKey.trim()}`,
        },
        body: JSON.stringify(body),
      });

      const hdrs: Record<string, string> = {};
      [
        'x-ratelimit-service',
        'x-ratelimit-limit-day',
        'x-ratelimit-remaining-day',
        'x-ratelimit-limit-month',
        'x-ratelimit-remaining-month',
      ].forEach((h) => {
        const val = res.headers.get(h);
        if (val !== null) hdrs[h] = val;
      });
      setPgHeaders(hdrs);
      setPgHttpStatus(res.status);
      setPgLatency(Math.round(performance.now() - started));

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPgRawJson(JSON.stringify(data, null, 2));
        setPgError(data?.error?.message || `HTTP ${res.status}`);
        await onRefresh();
        return;
      }

      if (spec.id === 'chat') {
        setChatReply(data?.choices?.[0]?.message?.content || '');
        setPgRawJson(JSON.stringify(data, null, 2));
      } else if (spec.id === 'coding') {
        setCodeOutput(data?.output || '');
        setPgRawJson(JSON.stringify(data, null, 2));
      } else if (spec.id === 'voice') {
        if (voiceMode === 'tts' && data?.audio_base64) {
          const audioUrl = `data:${data.mime_type || 'audio/wav'};base64,${data.audio_base64}`;
          setTtsAudioUrl(audioUrl);
          setTtsAudioBase64(data.audio_base64);
          setTranscribeBase64(data.audio_base64);
          setTranscribeMime(data.mime_type || 'audio/wav');
          setPgRawJson(
            JSON.stringify(
              { ...data, audio_base64: `[BASE64 WAV ${data.audio_base64.length} chars]` },
              null,
              2,
            ),
          );
        } else {
          setTranscribeOutput(data?.text || '');
          setPgRawJson(JSON.stringify(data, null, 2));
        }
      } else if (spec.id === 'vision') {
        setVisionOutput(data?.analysis || '');
        setPgRawJson(JSON.stringify(data, null, 2));
      } else if (spec.id === 'image') {
        const asset = data?.data?.[0];
        const previewSrc = asset?.url
          ? asset.url
          : asset?.b64_json
            ? `data:${asset.mime_type || 'image/png'};base64,${asset.b64_json}`
            : '';
        setImgResultUrl(previewSrc);
        setImgResultMime(asset?.mime_type || 'image/png');
        setImgResultSizeBytes(typeof asset?.size_bytes === 'number' ? asset.size_bytes : null);
        setImgResultNote(data?.text || '');
        const sanitizedData = Array.isArray(data?.data)
          ? data.data.map((d: Record<string, unknown>) =>
              typeof d.b64_json === 'string'
                ? { ...d, b64_json: `[BASE64 IMAGE ${d.b64_json.length} chars]` }
                : d,
            )
          : data?.data;
        setPgRawJson(JSON.stringify({ ...data, data: sanitizedData }, null, 2));
      } else if (spec.id === 'video') {
        const jobId = typeof data?.id === 'string' ? data.id : '';
        setVidJobId(jobId);
        setVidJobStatus(data?.status || 'queued');
        setPgRawJson(JSON.stringify(data, null, 2));

        // Poll asynchronous GET /v1/videos/jobs/:id until terminal status
        if (jobId) {
          for (let attempt = 0; attempt < 60; attempt += 1) {
            await new Promise((r) => setTimeout(r, 3000));
            if (!mountedRef.current) return;

            const pollRes = await fetch(`/v1/videos/jobs/${encodeURIComponent(jobId)}`, {
              headers: {
                Authorization: `Bearer ${sessionApiKey.trim()}`,
              },
            });
            const pollData = await pollRes.json().catch(() => ({}));
            if (!mountedRef.current) return;

            setPgHttpStatus(pollRes.status);
            setPgLatency(Math.round(performance.now() - started));
            setPgRawJson(JSON.stringify(pollData, null, 2));

            if (!pollRes.ok) {
              setVidJobStatus('failed');
              setPgError(pollData?.error?.message || `Job polling failed (HTTP ${pollRes.status})`);
              break;
            }

            const currentStatus = pollData?.status;
            setVidJobStatus(currentStatus || 'processing');

            if (currentStatus === 'succeeded') {
              setVidResultUrl(pollData?.video_url || '');
              setVidResultSizeBytes(
                typeof pollData?.size_bytes === 'number' ? pollData.size_bytes : null,
              );
              break;
            }
            if (currentStatus === 'failed') {
              setPgError(pollData?.error?.message || 'Video generation failed.');
              break;
            }
          }
        }
      }

      await onRefresh();
    } catch (err) {
      setPgError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      if (mountedRef.current) {
        setPgRunning(false);
      }
    }
  };

  const codeSnippet =
    codeLang === 'js'
      ? spec.jsExample
      : codeLang === 'python'
        ? spec.pythonExample
        : spec.curlExample;

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Explore APIs</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{spec.name}</h2>
                <span className={`text-xs font-semibold ${statusColorClass}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{spec.shortDescription}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('playground')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Test Playground</span>
          </button>
          <button
            type="button"
            disabled={creatingKey}
            onClick={() => {
              handleGenerateScopedKey(true);
              setActiveTab('keys');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-medium text-white whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{creatingKey ? 'Generating...' : `Generate ${spec.id.toUpperCase()} Key`}</span>
          </button>
        </div>
      </div>

      {/* What it does, Endpoints, Quotas & Pricing summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">What this API does</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{spec.whatItDoes}</p>
            <p className="text-xs text-slate-500 mt-2">
              Status note: <span className="text-slate-700">{spec.availabilityNote}</span>
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500">Primary Endpoint</span>
              <code className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                {spec.method} {spec.endpoint}
              </code>
            </div>
            {spec.secondaryEndpoints?.map((ep) => (
              <div key={ep.path} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500">{ep.description}</span>
                <code className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                  {ep.method} {ep.path}
                </code>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="text-xs font-medium text-slate-500 mb-2">Supported Models</div>
            <div className="space-y-1.5">
              {spec.models.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4 text-xs">
                  <span className="font-mono font-semibold text-slate-900">{m.id}</span>
                  <span className="text-slate-500">{m.contextOrSpec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Usage Limits & Pricing</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Starter</span>
                <span className="font-mono text-slate-900 tabular-nums">{spec.pricing.starter}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Pro</span>
                <span className="font-mono text-slate-900 tabular-nums">{spec.pricing.pro}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Enterprise</span>
                <span className="font-mono text-slate-900 tabular-nums">{spec.pricing.enterprise}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500">Metered Rate</span>
                <span className="font-mono text-slate-700">{spec.pricing.unitPrice}</span>
              </div>
            </div>
          </div>

          {user && serviceStats ? (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-900">Your {spec.id} Quota (UTC)</span>
                <span className="font-mono text-slate-700 tabular-nums">
                  {serviceStats.daily_used} / {serviceStats.daily_limit} today ·{' '}
                  {serviceStats.monthly_used} / {serviceStats.monthly_limit} mo
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${
                      serviceStats.daily_limit > 0
                        ? Math.min(100, Math.round((serviceStats.daily_used / serviceStats.daily_limit) * 100))
                        : 0
                    }%`,
                  }}
                  className="h-full bg-blue-600 rounded-full"
                />
              </div>
            </div>
          ) : (
            <div className="pt-3 border-t border-slate-200 text-xs text-slate-500">
              Sign in to track live per-service quotas and generate scoped API keys.
            </div>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto max-w-full">
        {(
          [
            { id: 'docs', label: 'Documentation & Examples' },
            { id: 'playground', label: 'Test Playground' },
            { id: 'keys', label: `API Keys (${serviceKeys.length})` },
            { id: 'usage', label: `Usage & Logs (${serviceLogs.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Documentation & Examples */}
      {activeTab === 'docs' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Request Parameters</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Field</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Required</th>
                    <th className="py-2.5 px-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {spec.parameters.map((p) => (
                    <tr key={p.name}>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">{p.name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{p.type}</td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {p.required ? 'Required' : 'Optional'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Request Example ({spec.endpoint})</span>
                <button
                  type="button"
                  onClick={() => copyText('req-ex', spec.requestExample)}
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                >
                  {copiedId === 'req-ex' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'req-ex' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                <code>{spec.requestExample}</code>
              </pre>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>{spec.id === 'video' ? 'Job Response Example (200 OK)' : 'Response Example (200 OK)'}</span>
                <button
                  type="button"
                  onClick={() => copyText('res-ex', spec.responseExample)}
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                >
                  {copiedId === 'res-ex' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'res-ex' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                <code>{spec.responseExample}</code>
              </pre>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">SDK & Integration Examples</h3>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'js', label: 'JavaScript' },
                    { id: 'python', label: 'Python' },
                    { id: 'curl', label: 'cURL' },
                  ] as const
                ).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setCodeLang(l.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      codeLang === l.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>{codeLang === 'js' ? 'JavaScript (fetch)' : codeLang === 'python' ? 'Python (requests)' : 'cURL'}</span>
                <button
                  type="button"
                  onClick={() => copyText('sdk-ex', codeSnippet)}
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                >
                  {copiedId === 'sdk-ex' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'sdk-ex' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                <code>{codeSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Test Playground */}
      {activeTab === 'playground' && (
        <div className="space-y-4">
          {spec.availability === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <div className="text-xs font-semibold text-red-900">
                Last upstream generation test reported an error
              </div>
              <p className="text-xs text-red-800 leading-relaxed">{spec.availabilityNote}</p>
            </div>
          )}
          {spec.availability === 'untested' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
              <div className="text-xs font-semibold text-amber-900">
                Pending live generation verification
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                {spec.availabilityNote} Run a real test below to verify server provider connectivity
                and update live status to Active or Error.
              </p>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-7">
                  <label htmlFor="dtl-key" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Glaxyes API Key (scoped to {spec.id} or all)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="dtl-key"
                        type="password"
                        value={sessionApiKey}
                        onChange={(e) => onSessionApiKeyChange(e.target.value)}
                        placeholder="glx_live_..."
                        className="w-full h-10 pl-8 pr-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={creatingKey}
                      onClick={() => handleGenerateScopedKey(true)}
                      className="h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer"
                    >
                      {creatingKey ? 'Creating...' : `Generate ${spec.id} Key`}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <label htmlFor="dtl-model" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Model
                  </label>
                  <select
                    id="dtl-model"
                    value={pgModel}
                    onChange={(e) => setPgModel(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-900"
                  >
                    {spec.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {pgError && (
                <div
                  role="alert"
                  className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
                >
                  {pgError}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={executePlayground}
                  className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  {spec.id === 'chat' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          User Message
                        </label>
                        <textarea
                          rows={4}
                          value={chatPrompt}
                          onChange={(e) => setChatPrompt(e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                        />
                      </div>
                      {chatReply && (
                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900 whitespace-pre-wrap">
                          {chatReply}
                        </div>
                      )}
                    </>
                  )}

                  {spec.id === 'coding' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Language</label>
                          <select
                            value={codeLanguage}
                            onChange={(e) => setCodeLanguage(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono"
                          >
                            <option value="typescript">typescript</option>
                            <option value="python">python</option>
                            <option value="go">go</option>
                            <option value="sql">sql</option>
                            <option value="rust">rust</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Task</label>
                          <select
                            value={codeTask}
                            onChange={(e) => setCodeTask(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono"
                          >
                            <option value="generate">generate</option>
                            <option value="refactor">refactor</option>
                            <option value="debug">debug</option>
                            <option value="review">review</option>
                            <option value="explain">explain</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Instruction</label>
                        <textarea
                          rows={3}
                          value={codePrompt}
                          onChange={(e) => setCodePrompt(e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Source Context (optional)
                        </label>
                        <textarea
                          rows={3}
                          value={codeContext}
                          onChange={(e) => setCodeContext(e.target.value)}
                          placeholder="Paste existing code or error trace..."
                          className="w-full p-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-900"
                        />
                      </div>
                      {codeOutput && (
                        <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                          <code>{codeOutput}</code>
                        </pre>
                      )}
                    </>
                  )}

                  {spec.id === 'voice' && (
                    <>
                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                        <button
                          type="button"
                          onClick={() => setVoiceMode('tts')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                            voiceMode === 'tts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          Text-to-Speech (/v1/audio/speech)
                        </button>
                        <button
                          type="button"
                          onClick={() => setVoiceMode('transcribe')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                            voiceMode === 'transcribe' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          Transcription (/v1/audio/transcriptions)
                        </button>
                      </div>

                      {voiceMode === 'tts' ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Voice</label>
                              <select
                                value={ttsVoice}
                                onChange={(e) => setTtsVoice(e.target.value)}
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs"
                              >
                                <option value="Kore">Kore</option>
                                <option value="Puck">Puck</option>
                                <option value="Charon">Charon</option>
                                <option value="Fenrir">Fenrir</option>
                                <option value="Zephyr">Zephyr</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Style</label>
                              <input
                                type="text"
                                value={ttsStyle}
                                onChange={(e) => setTtsStyle(e.target.value)}
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Script Input</label>
                            <textarea
                              rows={3}
                              value={ttsInput}
                              onChange={(e) => setTtsInput(e.target.value)}
                              className="w-full p-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                            />
                          </div>
                          {ttsAudioUrl && (
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                <Volume2 className="w-4 h-4 text-blue-600" />
                                <span>Synthesized Audio (24kHz WAV)</span>
                              </div>
                              <audio controls src={ttsAudioUrl} className="w-full" />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label className="block text-xs font-medium text-slate-700">
                              Upload Audio File (WAV, MP3, WebM)
                            </label>
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                                <Upload className="w-3.5 h-3.5" />
                                <span>Choose Audio File</span>
                                <input
                                  type="file"
                                  accept="audio/wav,audio/mp3,audio/mpeg,audio/webm"
                                  onChange={handleAudioUpload}
                                  className="hidden"
                                />
                              </label>
                              {ttsAudioBase64 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTranscribeBase64(ttsAudioBase64);
                                    setTranscribeMime('audio/wav');
                                  }}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                                >
                                  Use last synthesized WAV clip
                                </button>
                              )}
                            </div>
                            {transcribeBase64 && (
                              <p className="text-xs font-mono text-emerald-700">
                                Audio loaded ({transcribeMime}, {transcribeBase64.length} base64 chars)
                              </p>
                            )}
                          </div>
                          {transcribeOutput && (
                            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900">
                              {transcribeOutput}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {spec.id === 'vision' && (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Image (PNG/JPEG/WebP)</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(ev) => handleImageUploadForTarget(ev, 'vision')}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={generateSampleDiagramPng}
                          className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                        >
                          Load Sample Diagram PNG
                        </button>
                      </div>
                      {visionPreviewUrl && (
                        <img
                          src={visionPreviewUrl}
                          alt="Vision input preview"
                          className="max-h-44 rounded-lg border border-slate-200 object-contain bg-slate-900"
                        />
                      )}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Analysis Prompt
                        </label>
                        <textarea
                          rows={2}
                          value={visionPrompt}
                          onChange={(e) => setVisionPrompt(e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                        />
                      </div>
                      {visionOutput && (
                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 whitespace-pre-wrap leading-relaxed">
                          {visionOutput}
                        </div>
                      )}
                    </>
                  )}

                  {spec.id === 'image' && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Aspect Ratio
                          </label>
                          <select
                            value={imgAspectRatio}
                            onChange={(e) => setImgAspectRatio(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono bg-white"
                          >
                            <option value="1:1">1:1</option>
                            <option value="16:9">16:9</option>
                            <option value="9:16">9:16</option>
                            <option value="4:3">4:3</option>
                            <option value="3:4">3:4</option>
                            <option value="4:5">4:5</option>
                            <option value="5:4">5:4</option>
                            <option value="3:2">3:2</option>
                            <option value="2:3">2:3</option>
                            <option value="21:9">21:9</option>
                            {(pgModel === 'gemini-nano-banana-2.1' || pgModel === 'gemini-3-pro-image') && (
                              <>
                                <option value="1:4">1:4</option>
                                <option value="4:1">4:1</option>
                                <option value="1:8">1:8</option>
                                <option value="8:1">8:1</option>
                              </>
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Output Format
                          </label>
                          <select
                            value={imgOutputFormat}
                            onChange={(e) =>
                              setImgOutputFormat(e.target.value as 'both' | 'url' | 'b64_json')
                            }
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono bg-white"
                          >
                            <option value="both">url + b64_json</option>
                            <option value="url">url only</option>
                            <option value="b64_json">b64_json only</option>
                          </select>
                        </div>

                        {(pgModel === 'gemini-nano-banana-2.1' || pgModel === 'gemini-3-pro-image') && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Image Size
                            </label>
                            <select
                              value={imgSize}
                              onChange={(e) => setImgSize(e.target.value as '1K' | '2K' | '4K')}
                              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono bg-white"
                            >
                              <option value="1K">1K</option>
                              <option value="2K">2K</option>
                              <option value="4K">4K</option>
                            </select>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Generation Prompt
                        </label>
                        <textarea
                          rows={3}
                          value={imgPrompt}
                          onChange={(e) => setImgPrompt(e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Reference Image (optional edit)</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(ev) => handleImageUploadForTarget(ev, 'image_ref')}
                            className="hidden"
                          />
                        </label>
                        {imgRefPreview && (
                          <button
                            type="button"
                            onClick={() => {
                              setImgRefPreview('');
                              setImgRefBase64('');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            Remove reference image
                          </button>
                        )}
                      </div>

                      {imgRefPreview && (
                        <img
                          src={imgRefPreview}
                          alt="Reference image for editing"
                          className="max-h-32 rounded-lg border border-slate-200 object-contain"
                        />
                      )}

                      {imgResultUrl && (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-900">
                              Generated Image ({imgResultMime}
                              {imgResultSizeBytes
                                ? ` · ${Math.round(imgResultSizeBytes / 1024)} KB`
                                : ''}
                              )
                            </span>
                            <a
                              href={imgResultUrl}
                              download="glaxyes-generated.png"
                              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </a>
                          </div>
                          <img
                            src={imgResultUrl}
                            alt="Generated output"
                            className="w-full max-h-96 rounded-lg border border-slate-200 object-contain bg-slate-950"
                          />
                          {imgResultNote && (
                            <p className="text-xs text-slate-600">{imgResultNote}</p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {spec.id === 'video' && (
                    <>
                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                        <button
                          type="button"
                          onClick={() => setVidMode('text_to_video')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                            vidMode === 'text_to_video'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          Text-to-Video
                        </button>
                        <button
                          type="button"
                          onClick={() => setVidMode('image_to_video')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                            vidMode === 'image_to_video'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          Image-to-Video
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Aspect Ratio
                          </label>
                          <select
                            value={vidAspectRatio}
                            onChange={(e) => setVidAspectRatio(e.target.value as '16:9' | '9:16')}
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono bg-white"
                          >
                            <option value="16:9">16:9</option>
                            <option value="9:16">9:16</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Duration
                          </label>
                          <select
                            value={vidDuration}
                            onChange={(e) =>
                              setVidDuration(e.target.value as '5s' | '8s' | '10s' | '15s')
                            }
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono bg-white"
                          >
                            <option value="5s">5s</option>
                            <option value="8s">8s</option>
                            <option value="10s">10s</option>
                            <option value="15s">15s</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Resolution
                          </label>
                          <select
                            value={vidResolution}
                            onChange={(e) =>
                              setVidResolution(e.target.value as '360p' | '720p' | '1080p' | '4k')
                            }
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-mono bg-white"
                          >
                            <option value="360p">360p</option>
                            <option value="720p">720p</option>
                            <option value="1080p">1080p</option>
                            <option value="4k">4k</option>
                          </select>
                        </div>
                      </div>

                      {vidMode === 'image_to_video' && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload Starting Frame (PNG/JPEG/WebP)</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(ev) => handleImageUploadForTarget(ev, 'video_ref')}
                                className="hidden"
                              />
                            </label>
                            {vidRefPreview && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVidRefPreview('');
                                  setVidRefBase64('');
                                }}
                                className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                              >
                                Clear frame
                              </button>
                            )}
                          </div>
                          {vidRefPreview && (
                            <img
                              src={vidRefPreview}
                              alt="Video starting frame"
                              className="max-h-36 rounded-lg border border-slate-200 object-contain"
                            />
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Video Prompt
                        </label>
                        <textarea
                          rows={3}
                          value={vidPrompt}
                          onChange={(e) => setVidPrompt(e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                        />
                      </div>

                      {vidJobId && (
                        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 font-mono text-slate-800">
                            {(vidJobStatus === 'queued' || vidJobStatus === 'processing') && (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                            )}
                            <span>Job {vidJobId}</span>
                          </div>
                          <span
                            className={`font-mono font-semibold uppercase ${
                              vidJobStatus === 'succeeded'
                                ? 'text-emerald-700'
                                : vidJobStatus === 'failed'
                                  ? 'text-red-700'
                                  : 'text-blue-700'
                            }`}
                          >
                            {vidJobStatus}
                          </span>
                        </div>
                      )}

                      {vidResultUrl && (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-900">
                              Generated MP4 Video
                              {vidResultSizeBytes
                                ? ` (${(vidResultSizeBytes / (1024 * 1024)).toFixed(2)} MB)`
                                : ''}
                            </span>
                            <a
                              href={vidResultUrl}
                              download="glaxyes-generated.mp4"
                              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download MP4</span>
                            </a>
                          </div>
                          <video
                            controls
                            playsInline
                            src={vidResultUrl}
                            className="w-full max-h-96 rounded-lg border border-slate-200 bg-black"
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={pgRunning}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-medium text-white cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {pgRunning
                          ? spec.id === 'video'
                            ? 'Generating Video...'
                            : 'Executing...'
                          : spec.id === 'video'
                            ? 'Queue Video Job'
                            : 'Send Request'}
                      </span>
                    </button>
                  </div>
                </form>

                <div className="lg:col-span-5 bg-slate-950 text-slate-200 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs font-mono">
                    <span>HTTP Inspector</span>
                    {pgHttpStatus !== null && (
                      <span className={pgHttpStatus < 400 ? 'text-emerald-400' : 'text-red-400'}>
                        HTTP {pgHttpStatus} · {pgLatency ?? 0}ms
                      </span>
                    )}
                  </div>
                  <div className="p-4 border-b border-slate-800 space-y-1 text-xs font-mono tabular-nums">
                    {Object.keys(pgHeaders).length === 0 ? (
                      <span className="text-slate-500">Rate limit headers appear here after running.</span>
                    ) : (
                      Object.entries(pgHeaders).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">{k}</span>
                          <span className="text-blue-300">{v}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <pre className="p-4 text-xs font-mono text-slate-200 overflow-auto max-h-[340px] whitespace-pre-wrap">
                    <code>{pgRawJson || '// Raw JSON response payload will appear here.'}</code>
                  </pre>
                </div>
              </div>
        </div>
      )}

      {/* TAB 3: Scoped API Keys */}
      {activeTab === 'keys' && (
        <div className="space-y-4">
          {!user ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900">Sign in to manage {spec.name} keys</p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="px-4 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white cursor-pointer"
              >
                Sign In or Register
              </button>
            </div>
          ) : (
            <>
              {keyError && (
                <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {keyError}
                </div>
              )}

              {revealedKey && (
                <div className="bg-slate-950 text-white rounded-xl border border-slate-800 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      Scoped Key Created: {revealedKey.name} ({spec.id})
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevealedKey(null)}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-[220px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-blue-300 break-all">
                      {revealedKey.rawKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText('rev-key', revealedKey.rawKey)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium cursor-pointer"
                    >
                      {copiedId === 'rev-key' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === 'rev-key' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSessionApiKeyChange(revealedKey.rawKey);
                        setActiveTab('playground');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Use in Playground</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    New {spec.id.toUpperCase()} Scoped Key Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  disabled={creatingKey}
                  onClick={() => handleGenerateScopedKey(true)}
                  className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-medium text-white cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingKey ? 'Generating...' : `Generate ${spec.id} Key`}</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {serviceKeys.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No keys scoped to {spec.name} yet. Generate one above to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Name</th>
                          <th className="py-2.5 px-4">Prefix</th>
                          <th className="py-2.5 px-4">Scope</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Requests</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {serviceKeys.map((k) => (
                          <tr key={k.id} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-4 font-medium text-slate-900">{k.name}</td>
                            <td className="py-2.5 px-4 font-mono text-slate-600">{k.key_prefix}</td>
                            <td className="py-2.5 px-4 font-mono text-slate-700">{k.service_scope}</td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`font-medium ${
                                  k.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {k.status === 'active' ? 'Active' : 'Revoked'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                              {k.total_requests.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="inline-flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={busyKeyId === k.id}
                                  onClick={() => handleToggleKeyStatus(k)}
                                  className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                  {k.status === 'active' ? 'Revoke' : 'Restore'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKeyId === k.id}
                                  onClick={() => handleDeleteKey(k)}
                                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: Service-Specific Usage & Logs */}
      {activeTab === 'usage' && (
        <div className="space-y-4">
          {!user ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <p className="text-xs text-slate-500">Sign in to inspect usage logs for {spec.name}.</p>
            </div>
          ) : (
            <>
              {serviceStats && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">Today ({spec.id})</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                      {serviceStats.daily_used} / {serviceStats.daily_limit}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">This Month ({spec.id})</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                      {serviceStats.monthly_used} / {serviceStats.monthly_limit}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">Total Tokens</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                      {serviceStats.total_tokens.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">Avg Latency</div>
                    <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                      {serviceStats.avg_latency_ms}ms
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {spec.name} Request Logs
                  </h3>
                </div>
                {serviceLogs.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-500">
                    No requests recorded for {spec.name} yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Timestamp</th>
                          <th className="py-2.5 px-4">Key</th>
                          <th className="py-2.5 px-4">Model</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Tokens</th>
                          <th className="py-2.5 px-4 text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {serviceLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                              {log.key_name || log.key_prefix || 'Deleted'}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-900 whitespace-nowrap">
                              {log.model}
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <span
                                className={`font-mono font-medium ${
                                  log.status_code < 400 ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {log.status_code}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                              {log.total_tokens.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                              {log.latency_ms}ms
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
