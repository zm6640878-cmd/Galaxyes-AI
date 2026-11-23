import { Check, Copy, Key, Play, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { ApiKeyItem, KeyServiceScope, UserProfile } from '../types';

interface ApiKeysPageProps {
  user: UserProfile;
  keys: ApiKeyItem[];
  onRefresh: () => Promise<void>;
  onUseKeyInPlayground: (rawKey: string) => void;
}

const SCOPE_LABELS: Record<KeyServiceScope, string> = {
  all: 'All Services',
  chat: 'Chat API',
  coding: 'Coding API',
  voice: 'Voice API',
  vision: 'Vision API',
  image: 'Image API',
  video: 'Video API',
};

export function ApiKeysPage({
  user,
  keys,
  onRefresh,
  onUseKeyInPlayground,
}: ApiKeysPageProps) {
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'filter-all' | KeyServiceScope>('filter-all');
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [serviceScope, setServiceScope] = useState<KeyServiceScope>('all');
  const [dailyOverride, setDailyOverride] = useState('');
  const [monthlyOverride, setMonthlyOverride] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revealedKey, setRevealedKey] = useState<{
    name: string;
    scope: KeyServiceScope;
    rawKey: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);

  const filteredKeys = keys.filter((k) => {
    if (scopeFilter !== 'filter-all' && k.service_scope !== scopeFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      k.name.toLowerCase().includes(q) ||
      k.key_prefix.toLowerCase().includes(q) ||
      k.service_scope.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await api.createKey({
        name: keyName.trim(),
        service_scope: serviceScope,
        daily_limit: dailyOverride.trim() ? Number(dailyOverride.trim()) : null,
        monthly_limit: monthlyOverride.trim() ? Number(monthlyOverride.trim()) : null,
      });
      setRevealedKey({
        name: res.key.name,
        scope: res.key.service_scope,
        rawKey: res.rawKey,
      });
      setKeyName('');
      setServiceScope('all');
      setDailyOverride('');
      setMonthlyOverride('');
      setShowCreate(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (key: ApiKeyItem) => {
    setBusyKeyId(key.id);
    setError(null);
    try {
      await api.updateKey(key.id, {
        status: key.status === 'active' ? 'revoked' : 'active',
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update API key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleDelete = async (key: ApiKeyItem) => {
    setBusyKeyId(key.id);
    setError(null);
    try {
      await api.deleteKey(key.id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key.');
    } finally {
      setBusyKeyId(null);
    }
  };

  const copyRevealedKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey.rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">API Keys</h2>
          <p className="text-xs text-slate-500 mt-1">
            Issue general or service-scoped Glaxyes API keys for Chat, Coding, Voice, Vision, Image, or Video endpoints.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreate((prev) => !prev);
            setError(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Create API Key</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {revealedKey && (
        <div className="bg-slate-950 text-white rounded-xl border border-slate-800 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Save your secret API key: {revealedKey.name} · Scope: {SCOPE_LABELS[revealedKey.scope]}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                This raw key is displayed once and never stored in plaintext on the server.
              </p>
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
            <code className="flex-1 min-w-[240px] px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-blue-300 break-all">
              {revealedKey.rawKey}
            </code>
            <button
              type="button"
              onClick={copyRevealedKey}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Key'}</span>
            </button>
            <button
              type="button"
              onClick={() => onUseKeyInPlayground(revealedKey.rawKey)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Test in Playground</span>
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Generate New API Key</h3>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="key-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                Key Name
              </label>
              <input
                id="key-name"
                type="text"
                required
                minLength={2}
                maxLength={64}
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Coding Service Key"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="key-scope" className="block text-xs font-medium text-slate-700 mb-1.5">
                Service Scope
              </label>
              <select
                id="key-scope"
                value={serviceScope}
                onChange={(e) => setServiceScope(e.target.value as KeyServiceScope)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="all">All Services</option>
                <option value="chat">Glaxyes Chat API</option>
                <option value="coding">Glaxyes Coding API</option>
                <option value="voice">Glaxyes Voice API</option>
                <option value="vision">Glaxyes Vision API</option>
                <option value="image">Glaxyes Image API</option>
                <option value="video">Glaxyes Video API</option>
              </select>
            </div>

            <div>
              <label htmlFor="key-daily" className="block text-xs font-medium text-slate-700 mb-1.5">
                Daily Cap (optional)
              </label>
              <input
                id="key-daily"
                type="number"
                min={1}
                value={dailyOverride}
                onChange={(e) => setDailyOverride(e.target.value)}
                placeholder={String(user.daily_limit)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="key-monthly" className="block text-xs font-medium text-slate-700 mb-1.5">
                Monthly Cap (optional)
              </label>
              <input
                id="key-monthly"
                type="number"
                min={1}
                value={monthlyOverride}
                onChange={(e) => setMonthlyOverride(e.target.value)}
                placeholder={String(user.monthly_limit)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-medium text-white transition-colors cursor-pointer"
            >
              {creating ? 'Generating...' : 'Generate Key'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter keys by name or prefix..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <select
              aria-label="Filter by service scope"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as 'filter-all' | KeyServiceScope)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
            >
              <option value="filter-all">All Scopes</option>
              <option value="all">Unrestricted (All)</option>
              <option value="chat">Chat API</option>
              <option value="coding">Coding API</option>
              <option value="voice">Voice API</option>
              <option value="vision">Vision API</option>
              <option value="image">Image API</option>
              <option value="video">Video API</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {filteredKeys.length} {filteredKeys.length === 1 ? 'key' : 'keys'}
          </span>
        </div>

        {filteredKeys.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Key className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-900">
              {keys.length === 0 ? 'No API keys created yet' : 'No matching API keys'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {keys.length === 0
                ? 'Generate a Glaxyes API key scoped to all services or a specific API.'
                : 'Try adjusting your filter query.'}
            </p>
            {keys.length === 0 && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First API Key</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Key Prefix</th>
                  <th className="py-3 px-4">Service Scope</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Today</th>
                  <th className="py-3 px-4 text-right">Total Reqs</th>
                  <th className="py-3 px-4">Last Used</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredKeys.map((k) => {
                  const busy = busyKeyId === k.id;
                  return (
                    <tr key={k.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {k.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {k.key_prefix}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {SCOPE_LABELS[k.service_scope] || k.service_scope}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            k.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {k.status === 'active' ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {k.daily_used.toLocaleString()}
                        {k.daily_limit ? ` / ${k.daily_limit.toLocaleString()}` : ''}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {k.total_requests.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleStatus(k)}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 cursor-pointer"
                          >
                            {k.status === 'active' ? 'Revoke' : 'Restore'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDelete(k)}
                            aria-label={`Delete ${k.name}`}
                            className="text-slate-400 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
