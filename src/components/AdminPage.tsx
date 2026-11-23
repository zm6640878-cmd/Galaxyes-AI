import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type {
  AdminKeyItem,
  AdminOverview,
  AdminServiceQuotaItem,
  AdminUserItem,
  UsageLogItem,
  UserPlan,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types';
import { UsageChart } from './UsageChart';

interface AdminPageProps {
  currentUser: UserProfile;
  onUserUpdated: () => Promise<void>;
}

type AdminSection = 'users' | 'keys' | 'logs';

export function AdminPage({ currentUser, onUserUpdated }: AdminPageProps) {
  const [section, setSection] = useState<AdminSection>('users');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [keys, setKeys] = useState<AdminKeyItem[]>([]);
  const [logs, setLogs] = useState<UsageLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editPlan, setEditPlan] = useState<UserPlan>('starter');
  const [editDaily, setEditDaily] = useState<string>('100');
  const [editMonthly, setEditMonthly] = useState<string>('2000');
  const [editStatus, setEditStatus] = useState<UserStatus>('active');
  const [editRole, setEditRole] = useState<UserRole>('developer');
  const [serviceQuotas, setServiceQuotas] = useState<AdminServiceQuotaItem[]>([]);
  const [savingUser, setSavingUser] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, uRes, kRes, lRes] = await Promise.all([
        api.getAdminOverview(),
        api.getAdminUsers(),
        api.getAdminKeys(),
        api.getAdminLogs(80),
      ]);
      setOverview(ovRes);
      setUsers(uRes.users);
      setKeys(kRes.keys);
      setLogs(lRes.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const openEditUser = async (u: AdminUserItem) => {
    setEditingUser(u);
    setEditPlan(u.plan);
    setEditDaily(String(u.daily_limit));
    setEditMonthly(String(u.monthly_limit));
    setEditStatus(u.status);
    setEditRole(u.role);
    try {
      const qRes = await api.getAdminUserServiceQuotas(u.id);
      setServiceQuotas(qRes.quotas);
    } catch {
      setServiceQuotas([]);
    }
  };

  const handlePlanChange = (nextPlan: UserPlan) => {
    setEditPlan(nextPlan);
    if (nextPlan === 'starter') {
      setEditDaily('100');
      setEditMonthly('2000');
    } else if (nextPlan === 'pro') {
      setEditDaily('1000');
      setEditMonthly('25000');
    } else {
      setEditDaily('10000');
      setEditMonthly('250000');
    }
  };

  const updateServiceQuotaField = (
    service: AdminServiceQuotaItem['service'],
    field: 'daily_limit' | 'monthly_limit',
    value: string,
  ) => {
    const parsed = Math.max(0, Math.floor(Number(value) || 0));
    setServiceQuotas((prev) =>
      prev.map((q) => (q.service === service ? { ...q, [field]: parsed } : q)),
    );
  };

  const saveUserChanges = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    setError(null);
    try {
      await api.updateAdminUser(editingUser.id, {
        plan: editPlan,
        daily_limit: Number(editDaily),
        monthly_limit: Number(editMonthly),
        status: editStatus,
        role: editRole,
      });
      if (serviceQuotas.length > 0) {
        await api.updateAdminUserServiceQuotas(
          editingUser.id,
          serviceQuotas.map((q) => ({
            service: q.service,
            daily_limit: q.daily_limit,
            monthly_limit: q.monthly_limit,
          })),
        );
      }
      setEditingUser(null);
      await Promise.all([loadAdminData(), onUserUpdated()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleAdminKey = async (k: AdminKeyItem) => {
    setError(null);
    try {
      await api.revokeAdminKey(k.id, k.status === 'active' ? 'revoked' : 'active');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update API key.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Console</h2>
          <p className="text-xs text-slate-500 mt-1">
            Platform-wide telemetry, per-service quota governance, and global API key controls.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          {loading ? 'Refreshing...' : 'Refresh Metrics'}
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

      {overview && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Registered Users</div>
              <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {overview.metrics.total_users.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                {overview.metrics.active_users} active · {overview.metrics.active_keys} active keys
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Requests Today (UTC)</div>
              <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {overview.metrics.requests_today.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                {overview.metrics.requests_month.toLocaleString()} this month
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Platform Tokens</div>
              <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {overview.metrics.total_tokens.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                {overview.metrics.total_requests.toLocaleString()} total requests
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Latency & Errors</div>
              <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {overview.metrics.avg_latency_ms}ms
              </div>
              <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                {overview.metrics.error_count.toLocaleString()} error responses
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <UsageChart
                data={overview.dailySeries}
                metric="requests"
                title="Platform Traffic (14 Days)"
                subtitle="Total API requests across all Glaxyes AI services"
              />
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Traffic by API Service</h3>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Service</th>
                    <th className="py-2.5 px-4 text-right">Requests</th>
                    <th className="py-2.5 px-4 text-right">Tokens</th>
                    <th className="py-2.5 px-4 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {overview.byService.map((svc) => (
                    <tr key={svc.service}>
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                        {svc.service}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {svc.requests.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {svc.tokens.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {svc.avg_latency_ms}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editingUser && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Edit User Quotas: {editingUser.name}
              </h3>
              <p className="text-xs text-slate-500">{editingUser.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Plan Tier</label>
              <select
                value={editPlan}
                onChange={(e) => handlePlanChange(e.target.value as UserPlan)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900"
              >
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Global Daily Cap</label>
              <input
                type="number"
                min={0}
                value={editDaily}
                onChange={(e) => setEditDaily(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 font-mono text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Global Monthly Cap</label>
              <input
                type="number"
                min={0}
                value={editMonthly}
                onChange={(e) => setEditMonthly(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 font-mono text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
              <select
                value={editRole}
                disabled={editingUser.id === currentUser.id}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900 disabled:bg-slate-100"
              >
                <option value="developer">developer</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={editStatus}
                disabled={editingUser.id === currentUser.id}
                onChange={(e) => setEditStatus(e.target.value as UserStatus)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900 disabled:bg-slate-100"
              >
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </div>
          </div>

          {serviceQuotas.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-semibold text-slate-800">
                Per-Service Quotas (Daily / Monthly)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {serviceQuotas.map((q) => (
                  <div
                    key={q.service}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-900">{q.service}</span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {q.daily_used} today · {q.monthly_used} mo
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0}
                        aria-label={`${q.service} daily limit`}
                        value={q.daily_limit}
                        onChange={(e) =>
                          updateServiceQuotaField(q.service, 'daily_limit', e.target.value)
                        }
                        className="h-8 px-2 rounded border border-slate-200 bg-white font-mono text-xs"
                      />
                      <input
                        type="number"
                        min={0}
                        aria-label={`${q.service} monthly limit`}
                        value={q.monthly_limit}
                        onChange={(e) =>
                          updateServiceQuotaField(q.service, 'monthly_limit', e.target.value)
                        }
                        className="h-8 px-2 rounded border border-slate-200 bg-white font-mono text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={savingUser}
              onClick={saveUserChanges}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-medium text-white cursor-pointer"
            >
              {savingUser ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'users', label: `Users (${users.length})` },
                { id: 'keys', label: `All API Keys (${keys.length})` },
                { id: 'logs', label: `Global Logs (${logs.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  section === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {section === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Role / Plan</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Today / Limit</th>
                  <th className="py-2.5 px-4 text-right">Month / Limit</th>
                  <th className="py-2.5 px-4 text-right">Tokens</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="text-slate-500 font-mono">{u.email}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {u.role} · {u.plan}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          u.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {u.status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {u.daily_used.toLocaleString()} / {u.daily_limit.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {u.monthly_used.toLocaleString()} / {u.monthly_limit.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {u.total_tokens.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditUser(u)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        Edit Quotas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === 'keys' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Key Name</th>
                  <th className="py-2.5 px-4">Owner</th>
                  <th className="py-2.5 px-4">Prefix</th>
                  <th className="py-2.5 px-4">Scope</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Requests</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-medium text-slate-900">{k.name}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{k.owner_email}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{k.key_prefix}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{k.service_scope || 'all'}</td>
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
                      <button
                        type="button"
                        onClick={() => handleToggleAdminKey(k)}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        {k.status === 'active' ? 'Revoke' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === 'logs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Service</th>
                  <th className="py-2.5 px-4">Model</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Tokens</th>
                  <th className="py-2.5 px-4 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {log.user_email}
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
    </div>
  );
}
