import { ArrowUpRight, Compass, Key, Play, Terminal } from 'lucide-react';
import type {
  ApiKeyItem,
  ApiServiceId,
  DashboardTab,
  MarketplaceApiSpec,
  UsageLogItem,
  UsageSummary,
  UserProfile,
} from '../types';
import { UsageChart } from './UsageChart';

interface OverviewPageProps {
  user: UserProfile;
  summary: UsageSummary | null;
  marketplace: MarketplaceApiSpec[];
  keys: ApiKeyItem[];
  logs: UsageLogItem[];
  loading: boolean;
  onNavigate: (tab: DashboardTab) => void;
  onOpenApiDetail: (apiId: ApiServiceId) => void;
}

export function OverviewPage({
  user,
  summary,
  marketplace,
  keys,
  logs,
  loading,
  onNavigate,
  onOpenApiDetail,
}: OverviewPageProps) {
  const dailyUsed = summary?.quotas.daily_used ?? user.daily_used;
  const dailyLimit = summary?.quotas.daily_limit ?? user.daily_limit;
  const dailyPct = dailyLimit > 0 ? Math.min(100, Math.round((dailyUsed / dailyLimit) * 100)) : 0;

  const monthlyUsed = summary?.quotas.monthly_used ?? user.monthly_used;
  const monthlyLimit = summary?.quotas.monthly_limit ?? user.monthly_limit;
  const monthlyPct =
    monthlyLimit > 0 ? Math.min(100, Math.round((monthlyUsed / monthlyLimit) * 100)) : 0;

  const activeKeysCount = keys.filter((k) => k.status === 'active').length;
  const serviceMap = new Map((summary?.byService ?? []).map((s) => [s.service, s]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Workspace Overview
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Signed in as {user.email} · Plan: {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} · Role: {user.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Explore APIs</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('keys')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Manage Keys</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('playground')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Test API Endpoint</span>
          </button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-32 bg-white border border-slate-200 rounded-xl p-5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Chat Quota Today (UTC)</span>
              <span className="font-mono tabular-nums">{dailyPct}%</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {dailyUsed.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                / {dailyLimit.toLocaleString()} reqs
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                style={{ width: `${dailyPct}%` }}
                className={`h-full rounded-full ${
                  dailyPct >= 90 ? 'bg-red-600' : dailyPct >= 70 ? 'bg-amber-600' : 'bg-blue-600'
                }`}
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Monthly Requests (UTC)</span>
              <span className="font-mono tabular-nums">{monthlyPct}%</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {monthlyUsed.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                / {monthlyLimit.toLocaleString()} reqs
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                style={{ width: `${monthlyPct}%` }}
                className={`h-full rounded-full ${
                  monthlyPct >= 90 ? 'bg-red-600' : monthlyPct >= 70 ? 'bg-amber-600' : 'bg-blue-600'
                }`}
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div className="text-xs text-slate-500">Total Tokens Processed</div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {(summary?.totals.total_tokens ?? 0).toLocaleString()}
            </div>
            <div className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
              {(summary?.totals.prompt_tokens ?? 0).toLocaleString()} in ·{' '}
              {(summary?.totals.completion_tokens ?? 0).toLocaleString()} out
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div className="text-xs text-slate-500">Active Keys & Latency</div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {activeKeysCount} <span className="text-sm font-normal text-slate-500">active keys</span>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
              Avg latency: {summary?.totals.avg_latency_ms ?? 0}ms · Errors: {summary?.totals.error_count ?? 0}
            </div>
          </div>
        </div>
      )}

      {marketplace.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">API Marketplace</h3>
            <button
              type="button"
              onClick={() => onNavigate('explore')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              Browse all 6 APIs
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {marketplace.map((item) => {
              const svc = serviceMap.get(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenApiDetail(item.id)}
                  className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{item.name}</span>
                    <span
                      className={`text-[11px] font-semibold ${
                        item.availability === 'available'
                          ? 'text-emerald-700'
                          : item.availability === 'error'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {item.availability === 'available'
                        ? 'Active'
                        : item.availability === 'error'
                          ? 'Error'
                          : 'Untested'}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-500">{item.endpoint}</div>
                  {svc && (
                    <div className="mt-2.5 text-xs font-mono text-slate-700 tabular-nums">
                      Today: {svc.daily_used} / {svc.daily_limit} · Month: {svc.monthly_used} /{' '}
                      {svc.monthly_limit}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <UsageChart
            data={summary?.dailySeries ?? []}
            metric="requests"
            title="API Request Volume"
            subtitle="Requests routed across all Glaxyes AI endpoints over the past 14 days (UTC)"
          />
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Terminal className="w-4 h-4 text-blue-600" />
              <span>Endpoint Quickstart</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Send OpenAI-compatible chat completion payloads or multimodal requests using any
              active <code className="font-mono text-slate-800">glx_live_</code> key.
            </p>
            <div className="bg-slate-950 rounded-lg p-3 text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed">
              <code>{`POST /v1/chat/completions
POST /v1/images/generations
POST /v1/videos/generations
POST /v1/code/completions
POST /v1/audio/speech
POST /v1/vision/analyze
Authorization: Bearer glx_live_...`}</code>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('docs')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              <span>Read full API docs</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('usage')}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              View audit logs
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Recent API Requests</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Latest calls recorded across your Glaxyes AI keys
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('usage')}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap cursor-pointer"
          >
            View all logs
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">No API requests recorded yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Explore our APIs, generate a scoped key, and run your first request in the Playground.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('explore')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <span>Explore APIs</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Service</th>
                  <th className="py-2.5 px-4">Model</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Tokens</th>
                  <th className="py-2.5 px-4 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {logs.slice(0, 8).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-800 whitespace-nowrap">
                      {log.service}
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
                        {log.status_code} {log.status_code < 400 ? 'OK' : 'Error'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {log.total_tokens.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
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
