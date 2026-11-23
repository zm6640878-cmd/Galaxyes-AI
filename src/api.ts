import type {
  AdminKeyItem,
  AdminOverview,
  AdminServiceQuotaItem,
  AdminUserItem,
  ApiKeyItem,
  ApiServiceId,
  BootstrapStatus,
  KeyServiceScope,
  MarketplaceApiSpec,
  ModelSpec,
  UsageLogItem,
  UsageSummary,
  UserPlan,
  UserProfile,
  UserRole,
  UserStatus,
} from './types';

// In-memory session token (never persisted to localStorage or sessionStorage)
let sessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string | { message?: string } };
  if (!res.ok) {
    const errMsg =
      typeof data.error === 'string'
        ? data.error
        : data.error?.message || `Request failed with HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data as T;
}

export const api = {
  getModels(): Promise<{ models: ModelSpec[] }> {
    return requestJson('/api/models');
  },

  getMarketplace(): Promise<{ apis: MarketplaceApiSpec[] }> {
    return requestJson('/api/marketplace');
  },

  getBootstrapStatus(): Promise<BootstrapStatus> {
    return requestJson('/api/auth/bootstrap-status');
  },

  claimAdmin(payload: {
    name: string;
    email: string;
    password: string;
    passcode?: string;
  }): Promise<{ token: string; user: UserProfile }> {
    return requestJson('/api/auth/claim-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  register(payload: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ token: string; user: UserProfile }> {
    return requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(payload: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: UserProfile }> {
    return requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return requestJson('/api/auth/logout', { method: 'POST' });
  },

  me(): Promise<{ user: UserProfile }> {
    return requestJson('/api/auth/me');
  },

  listKeys(service?: ApiServiceId): Promise<{ keys: ApiKeyItem[] }> {
    const qs = service ? `?service=${encodeURIComponent(service)}` : '';
    return requestJson(`/api/keys${qs}`);
  },

  createKey(payload: {
    name: string;
    service_scope?: KeyServiceScope;
    daily_limit?: number | null;
    monthly_limit?: number | null;
  }): Promise<{ key: ApiKeyItem; rawKey: string }> {
    return requestJson('/api/keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateKey(
    id: string,
    payload: { name?: string; status?: 'active' | 'revoked' },
  ): Promise<{ key: ApiKeyItem }> {
    return requestJson(`/api/keys/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteKey(id: string): Promise<{ ok: boolean }> {
    return requestJson(`/api/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getUsageSummary(): Promise<UsageSummary> {
    return requestJson('/api/usage/summary');
  },

  getUsageLogs(params?: {
    limit?: number;
    service?: ApiServiceId;
    model?: string;
    status?: string;
    api_key_id?: string;
  }): Promise<{ logs: UsageLogItem[] }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.service) qs.set('service', params.service);
    if (params?.model) qs.set('model', params.model);
    if (params?.status) qs.set('status', params.status);
    if (params?.api_key_id) qs.set('api_key_id', params.api_key_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson(`/api/usage/logs${suffix}`);
  },

  getAdminOverview(): Promise<AdminOverview> {
    return requestJson('/api/admin/overview');
  },

  getAdminUsers(): Promise<{ users: AdminUserItem[] }> {
    return requestJson('/api/admin/users');
  },

  getAdminUserServiceQuotas(userId: string): Promise<{ quotas: AdminServiceQuotaItem[] }> {
    return requestJson(`/api/admin/users/${encodeURIComponent(userId)}/service-quotas`);
  },

  updateAdminUserServiceQuotas(
    userId: string,
    quotas: Array<{ service: ApiServiceId; daily_limit: number; monthly_limit: number }>,
  ): Promise<{ ok: boolean }> {
    return requestJson(`/api/admin/users/${encodeURIComponent(userId)}/service-quotas`, {
      method: 'PUT',
      body: JSON.stringify({ quotas }),
    });
  },

  updateAdminUser(
    id: string,
    payload: {
      plan?: UserPlan;
      daily_limit?: number;
      monthly_limit?: number;
      status?: UserStatus;
      role?: UserRole;
    },
  ): Promise<{ user: UserProfile }> {
    return requestJson(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  getAdminKeys(): Promise<{ keys: AdminKeyItem[] }> {
    return requestJson('/api/admin/keys');
  },

  revokeAdminKey(id: string, status: 'active' | 'revoked'): Promise<{ ok: boolean; status: string }> {
    return requestJson(`/api/admin/keys/${encodeURIComponent(id)}/revoke`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  getAdminLogs(limit = 60): Promise<{ logs: UsageLogItem[] }> {
    return requestJson(`/api/admin/logs?limit=${limit}`);
  },
};
