export type UserRole = 'developer' | 'admin';
export type UserPlan = 'starter' | 'pro' | 'enterprise';
export type UserStatus = 'active' | 'suspended';

export type ApiServiceId = 'chat' | 'image' | 'video' | 'coding' | 'voice' | 'vision';
export type KeyServiceScope = 'all' | ApiServiceId;
export type ApiAvailabilityStatus = 'available' | 'error' | 'untested';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
  status: UserStatus;
  daily_limit: number;
  monthly_limit: number;
  daily_used: number;
  monthly_used: number;
  created_at: string;
}

export interface BootstrapStatus {
  adminExists: boolean;
  envPasscodeConfigured: boolean;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  service_scope: KeyServiceScope;
  status: 'active' | 'revoked';
  daily_limit: number | null;
  monthly_limit: number | null;
  total_requests: number;
  daily_used: number;
  monthly_used: number;
  last_used_at: string | null;
  created_at: string;
}

export interface ModelSpec {
  id: string;
  displayName: string;
  description: string;
  contextWindow: number;
  aliases: string[];
  tier: 'standard' | 'fast';
}

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

export interface DailySeriesPoint {
  date: string;
  requests: number;
  tokens: number;
  errors: number;
}

export interface ServiceUsageSummary {
  service: ApiServiceId;
  daily_used: number;
  daily_limit: number;
  daily_remaining: number;
  monthly_used: number;
  monthly_limit: number;
  monthly_remaining: number;
  total_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  error_count: number;
}

export interface UsageSummary {
  quotas: {
    daily_limit: number;
    daily_used: number;
    daily_remaining: number;
    monthly_limit: number;
    monthly_used: number;
    monthly_remaining: number;
    utc_date: string;
    utc_month: string;
  };
  totals: {
    total_requests: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    avg_latency_ms: number;
    error_count: number;
  };
  dailySeries: DailySeriesPoint[];
  byModel: Array<{
    model: string;
    requests: number;
    tokens: number;
    avg_latency_ms: number;
  }>;
  byService: ServiceUsageSummary[];
}

export interface UsageLogItem {
  id: string;
  service: ApiServiceId;
  api_key_id: string | null;
  key_name?: string | null;
  key_prefix?: string | null;
  user_email?: string;
  model: string;
  requested_model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status_code: number;
  stream: number;
  error_message: string | null;
  created_at: string;
}

export interface AdminOverview {
  metrics: {
    total_users: number;
    active_users: number;
    total_keys: number;
    active_keys: number;
    requests_today: number;
    requests_month: number;
    total_requests: number;
    total_tokens: number;
    avg_latency_ms: number;
    error_count: number;
  };
  dailySeries: DailySeriesPoint[];
  byService: Array<{
    service: ApiServiceId;
    requests: number;
    tokens: number;
    avg_latency_ms: number;
  }>;
}

export interface AdminUserItem extends UserProfile {
  active_keys: number;
  total_tokens: number;
}

export interface AdminKeyItem {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  service_scope: KeyServiceScope;
  status: 'active' | 'revoked';
  daily_limit: number | null;
  monthly_limit: number | null;
  total_requests: number;
  last_used_at: string | null;
  created_at: string;
  owner_email: string;
  owner_name: string;
}

export interface AdminServiceQuotaItem {
  service: ApiServiceId;
  daily_limit: number;
  monthly_limit: number;
  daily_used: number;
  monthly_used: number;
}

export type DashboardTab =
  | 'overview'
  | 'explore'
  | 'api-detail'
  | 'playground'
  | 'keys'
  | 'usage'
  | 'docs'
  | 'admin';
