import {
  Activity,
  BookOpen,
  Compass,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Play,
  Shield,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, setSessionToken } from './api';
import { AdminPage } from './components/AdminPage';
import { ApiDetailPage } from './components/ApiDetailPage';
import { ApiKeysPage } from './components/ApiKeysPage';
import { AuthPortal } from './components/AuthPortal';
import { DocsPage } from './components/DocsPage';
import { ExploreApisPage } from './components/ExploreApisPage';
import { GlaxyesLogo } from './components/GlaxyesLogo';
import { OverviewPage } from './components/OverviewPage';
import { PlaygroundPage } from './components/PlaygroundPage';
import { UsagePage } from './components/UsagePage';
import type {
  ApiKeyItem,
  ApiServiceId,
  BootstrapStatus,
  DashboardTab,
  MarketplaceApiSpec,
  ModelSpec,
  UsageLogItem,
  UsageSummary,
  UserProfile,
} from './types';

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>({
    adminExists: true,
    envPasscodeConfigured: false,
  });
  const [models, setModels] = useState<ModelSpec[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceApiSpec[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedApiId, setSelectedApiId] = useState<ApiServiceId>('chat');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [logs, setLogs] = useState<UsageLogItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [playgroundKey, setPlaygroundKey] = useState('');

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [bs, modRes, mktRes] = await Promise.all([
          api.getBootstrapStatus(),
          api.getModels(),
          api.getMarketplace(),
        ]);
        if (!active) return;
        setBootstrapStatus(bs);
        setModels(modRes.models);
        setMarketplace(mktRes.apis);
      } catch {
        // fallback defaults
      } finally {
        if (active) setInitializing(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const [meRes, keysRes, sumRes, logsRes, mktRes] = await Promise.all([
        api.me(),
        api.listKeys(),
        api.getUsageSummary(),
        api.getUsageLogs({ limit: 100 }),
        api.getMarketplace(),
      ]);
      setUser(meRes.user);
      setKeys(keysRes.keys);
      setSummary(sumRes);
      setLogs(logsRes.logs);
      setMarketplace(mktRes.apis);
    } catch {
      // ignore transient error
    } finally {
      setDataLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      refreshDashboard();
    }
  }, [user?.id, refreshDashboard]);

  const handleAuthenticated = (authenticatedUser: UserProfile) => {
    setUser(authenticatedUser);
    setActiveTab('overview');
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
    } catch {
      // ignore logout error
    }
    setSessionToken(null);
    setUser(null);
    setKeys([]);
    setSummary(null);
    setLogs([]);
    setPlaygroundKey('');
    try {
      const bs = await api.getBootstrapStatus();
      setBootstrapStatus(bs);
    } catch {
      // ignore
    }
  };

  const handleUseKeyInPlayground = (rawKey: string) => {
    setPlaygroundKey(rawKey);
    setActiveTab('playground');
  };

  const handleOpenApiDetail = (apiId: ApiServiceId) => {
    setSelectedApiId(apiId);
    setActiveTab('api-detail');
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <GlaxyesLogo className="w-6 h-6" />
          <span>Loading Glaxyes AI...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPortal
        bootstrapStatus={bootstrapStatus}
        models={models}
        marketplace={marketplace}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const navItems: Array<{
    id: DashboardTab;
    label: string;
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'explore', label: 'Explore APIs', icon: Compass },
    { id: 'playground', label: 'API Playground', icon: Play },
    { id: 'keys', label: 'API Keys', icon: KeyRound },
    { id: 'usage', label: 'Usage & Quotas', icon: Activity },
    { id: 'docs', label: 'API Docs', icon: BookOpen },
    ...(user.role === 'admin'
      ? [{ id: 'admin' as const, label: 'Admin Console', icon: Shield }]
      : []),
  ];

  const selectedApiSpec = marketplace.find((a) => a.id === selectedApiId) || marketplace[0];
  const selectedServiceStats = summary?.byService?.find((s) => s.service === selectedApiId);

  const tabTitles: Record<DashboardTab, string> = {
    overview: 'Overview',
    explore: 'Explore APIs',
    'api-detail': selectedApiSpec?.name || 'API Details',
    playground: 'API Playground',
    keys: 'API Keys',
    usage: 'Usage & Quotas',
    docs: 'API Documentation',
    admin: 'Admin Console',
  };

  const dailyPct =
    user.daily_limit > 0
      ? Math.min(100, Math.round((user.daily_used / user.daily_limit) * 100))
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center gap-2.5">
          <GlaxyesLogo className="w-6 h-6" />
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Glaxyes AI
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id || (item.id === 'explore' && activeTab === 'api-detail');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Chat Requests Today</span>
              <span className="font-mono text-slate-700 tabular-nums">
                {user.daily_used} / {user.daily_limit}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div style={{ width: `${dailyPct}%` }} className="h-full bg-blue-600 rounded-full" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">{user.name}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {user.role} · {user.plan}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <GlaxyesLogo className="w-6 h-6" />
                <span className="font-display text-base font-bold text-slate-900">Glaxyes AI</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active =
                  activeTab === item.id || (item.id === 'explore' && activeTab === 'api-detail');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">{user.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-14 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span>Glaxyes AI</span>
              {activeTab === 'api-detail' && (
                <>
                  <span aria-hidden="true">/</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('explore')}
                    className="hover:text-slate-900 cursor-pointer"
                  >
                    Explore APIs
                  </button>
                </>
              )}
              <span aria-hidden="true">/</span>
              <span className="font-medium text-slate-900 truncate">{tabTitles[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'keys' ? 'explore' : 'keys')}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeTab === 'keys' ? 'Explore APIs' : 'New API Key'}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
          {activeTab === 'overview' && (
            <OverviewPage
              user={user}
              summary={summary}
              marketplace={marketplace}
              keys={keys}
              logs={logs}
              loading={dataLoading}
              onNavigate={setActiveTab}
              onOpenApiDetail={handleOpenApiDetail}
            />
          )}

          {activeTab === 'explore' && (
            <ExploreApisPage
              apis={marketplace}
              serviceUsage={summary?.byService}
              keys={keys}
              isAuthenticated={true}
              onSelectApi={handleOpenApiDetail}
            />
          )}

          {activeTab === 'api-detail' && selectedApiSpec && (
            <ApiDetailPage
              spec={selectedApiSpec}
              user={user}
              keys={keys}
              serviceStats={selectedServiceStats}
              logs={logs}
              sessionApiKey={playgroundKey}
              onSessionApiKeyChange={setPlaygroundKey}
              onBack={() => setActiveTab('explore')}
              onRefresh={refreshDashboard}
            />
          )}

          {activeTab === 'playground' && (
            <PlaygroundPage
              models={models}
              sessionApiKey={playgroundKey}
              onSessionApiKeyChange={setPlaygroundKey}
              onRefreshDashboard={refreshDashboard}
            />
          )}

          {activeTab === 'keys' && (
            <ApiKeysPage
              user={user}
              keys={keys}
              onRefresh={refreshDashboard}
              onUseKeyInPlayground={handleUseKeyInPlayground}
            />
          )}

          {activeTab === 'usage' && (
            <UsagePage summary={summary} logs={logs} keys={keys} loading={dataLoading} />
          )}

          {activeTab === 'docs' && (
            <DocsPage models={models} sampleApiKey={playgroundKey || null} />
          )}

          {activeTab === 'admin' && user.role === 'admin' && (
            <AdminPage currentUser={user} onUserUpdated={refreshDashboard} />
          )}
        </main>
      </div>
    </div>
  );
}
