import { useState } from 'react';
import type { ApiKeyItem, ApiServiceId, UsageLogItem, UsageSummary } from '../types';
import { UsageChart } from './UsageChart';

interface UsagePageProps {
  summary: UsageSummary | null;
  logs: UsageLogItem[];
  keys: ApiKeyItem[];
  loading: boolean;
}

const SERVICE_NAMES: Record<ApiServiceId, string> = {
  chat: 'Chat API',
  coding: 'Coding API',
  voice: 'Voice API',
  vision: 'Vision API',
  image: 'Image Generation API',
  video: 'Video Generation API',
};

export function UsagePage({ summary, logs, keys, loading }: UsagePageProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'error'>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | ApiServiceId>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [keyFilter, setKeyFilter] = useState<string>('all');
  const [chartMetric, setChartMetric] = useState<'requests' | 'tokens'>('requests');

  const filteredLogs = logs.filter((log) => {
    if (statusFilter === 'ok' && log.status_code >= 400) return false;
    if (statusFilter === 'error' && log.status_code < 400) return false;
    if (serviceFilter !== 'all' && log.service !== serviceFilter) return false;
    if (modelFilter !== 'all' && log.model !== modelFilter) return false;
    if (keyFilter !== 'all' && log.api_key_id !== keyFilter) return false;
    return true;
  });

  const uniqueModels = Array.from(new Set(logs.map((l) => l.model)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Usage & Quotas</h2>
          <p className="text-xs text-slate-500 mt-1">
            Monitor separate UTC daily and monthly limits across Chat, Coding, Voice, Vision, Image, and Video APIs.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setChartMetric('requests')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              chartMetric === 'requests'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Requests
          </button>
          <button
            type="button"
            onClick={() => setChartMetric('tokens')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              chartMetric === 'tokens'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tokens
          </button>
        </div>
      </div>

      {summary?.byService && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Per-API Quotas & Usage ({summary.quotas.utc_date})
            </h3>
            <span className="text-xs text-slate-500 font-mono">Resets 00:00 UTC</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">API Service</th>
                  <th className="py-2.5 px-4 text-right">Daily Used / Limit</th>
                  <th className="py-2.5 px-4 text-right">Monthly Used / Limit</th>
                  <th className="py-2.5 px-4 text-right">Total Tokens</th>
                  <th className="py-2.5 px-4 text-right">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {summary.byService.map((svc) => (
                  <tr key={svc.service} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {SERVICE_NAMES[svc.service] || svc.service}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {svc.daily_used.toLocaleString()} / {svc.daily_limit.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {svc.monthly_used.toLocaleString()} / {svc.monthly_limit.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {svc.total_tokens.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {svc.avg_latency_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UsageChart
        data={summary?.dailySeries ?? []}
        metric={chartMetric}
        title={chartMetric === 'requests' ? '14-Day Request History' : '14-Day Token Consumption'}
        subtitle="Aggregated UTC usage across all Glaxyes API services"
      />

      {summary && summary.byModel.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Usage by Model</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Model</th>
                  <th className="py-2.5 px-4 text-right">Requests</th>
                  <th className="py-2.5 px-4 text-right">Total Tokens</th>
                  <th className="py-2.5 px-4 text-right">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {summary.byModel.map((m) => (
                  <tr key={m.model}>
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900">{m.model}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {m.requests.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {m.tokens.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {m.avg_latency_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Request Audit Logs</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by service"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value as 'all' | ApiServiceId)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
            >
              <option value="all">All APIs</option>
              <option value="chat">Chat API</option>
              <option value="coding">Coding API</option>
              <option value="voice">Voice API</option>
              <option value="vision">Vision API</option>
              <option value="image">Image API</option>
              <option value="video">Video API</option>
            </select>

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'ok' | 'error')}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
            >
              <option value="all">All statuses</option>
              <option value="ok">200 OK</option>
              <option value="error">Errors</option>
            </select>

            <select
              aria-label="Filter by model"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-700"
            >
              <option value="all">All models</option>
              {uniqueModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by API key"
              value={keyFilter}
              onChange={(e) => setKeyFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
            >
              <option value="all">All API keys</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading usage logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No matching API request logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Service</th>
                  <th className="py-2.5 px-4">Key</th>
                  <th className="py-2.5 px-4">Model</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Tokens</th>
                  <th className="py-2.5 px-4 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-800 whitespace-nowrap">
                      {log.service}
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
                      {log.error_message && (
                        <span className="ml-2 text-red-600 truncate max-w-[180px] inline-block align-bottom">
                          {log.error_message}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
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
    </div>
  );
}
