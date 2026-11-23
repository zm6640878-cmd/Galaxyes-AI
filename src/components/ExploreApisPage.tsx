import {
  ArrowRight,
  Code2,
  Eye,
  Film,
  Image,
  MessageSquare,
  Mic,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import type { ApiKeyItem, ApiServiceId, MarketplaceApiSpec, ServiceUsageSummary } from '../types';

interface ExploreApisPageProps {
  apis: MarketplaceApiSpec[];
  serviceUsage?: ServiceUsageSummary[];
  keys?: ApiKeyItem[];
  isAuthenticated: boolean;
  onSelectApi: (apiId: ApiServiceId) => void;
  onRequireAuth?: () => void;
}

const SERVICE_ICONS: Record<ApiServiceId, typeof MessageSquare> = {
  chat: MessageSquare,
  image: Image,
  video: Film,
  coding: Code2,
  voice: Mic,
  vision: Eye,
};

export function ExploreApisPage({
  apis,
  serviceUsage = [],
  keys = [],
  isAuthenticated,
  onSelectApi,
  onRequireAuth,
}: ExploreApisPageProps) {
  const [filter, setFilter] = useState<'all' | 'available' | 'attention'>('all');
  const [search, setSearch] = useState('');

  const usageMap = new Map(serviceUsage.map((s) => [s.service, s]));

  const filtered = apis.filter((item) => {
    if (filter === 'available' && item.availability !== 'available') return false;
    if (filter === 'attention' && item.availability === 'available') return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.shortDescription.toLowerCase().includes(q) ||
      item.endpoint.toLowerCase().includes(q) ||
      item.models.some((m) => m.id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Explore APIs</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Browse Glaxyes AI service endpoints, inspect supported Gemini models, generate
            service-scoped API keys, and run live completions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search APIs, endpoints, models..."
              className="h-9 w-60 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: `All (${apis.length})` },
                {
                  id: 'available',
                  label: `Active (${apis.filter((a) => a.availability === 'available').length})`,
                },
                {
                  id: 'attention',
                  label: `Untested / Error (${apis.filter((a) => a.availability !== 'available').length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No matching APIs found</p>
          <p className="text-xs text-slate-500 mt-1">
            Adjust your filter or search query to view available Glaxyes AI services.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((item) => {
            const Icon = SERVICE_ICONS[item.id];
            const svcStats = usageMap.get(item.id);
            const matchingKeys = keys.filter(
              (k) => k.status === 'active' && (k.service_scope === item.id || k.service_scope === 'all'),
            );

            return (
              <article
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
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

                  <div>
                    <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      {item.shortDescription}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Endpoint</span>
                      <code className="font-mono text-slate-900 truncate">{item.endpoint}</code>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Models</span>
                      <span className="font-mono text-slate-700 truncate">
                        {item.models.map((m) => m.id).join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Starter Limit</span>
                      <span className="font-mono text-slate-700 tabular-nums">
                        {item.quotasByPlan.starter.daily_limit.toLocaleString()}/day ·{' '}
                        {item.quotasByPlan.starter.monthly_limit.toLocaleString()}/mo
                      </span>
                    </div>
                    {isAuthenticated && svcStats && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Your Usage Today</span>
                        <span className="font-mono text-slate-900 font-medium tabular-nums">
                          {svcStats.daily_used.toLocaleString()} / {svcStats.daily_limit.toLocaleString()} ·{' '}
                          {matchingKeys.length} {matchingKeys.length === 1 ? 'key' : 'keys'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-500 truncate">
                    {item.pricing.unitPrice}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isAuthenticated && onRequireAuth && (
                      <button
                        type="button"
                        onClick={onRequireAuth}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                      >
                        Sign In
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectApi(item.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Open API</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
