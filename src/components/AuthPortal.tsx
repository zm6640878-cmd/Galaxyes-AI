import { ArrowRight, CheckCircle2, Compass, KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, setSessionToken } from '../api';
import type {
  ApiServiceId,
  BootstrapStatus,
  MarketplaceApiSpec,
  ModelSpec,
  UserProfile,
} from '../types';
import { ApiDetailPage } from './ApiDetailPage';
import { DocsPage } from './DocsPage';
import { ExploreApisPage } from './ExploreApisPage';
import { GlaxyesLogo } from './GlaxyesLogo';

interface AuthPortalProps {
  bootstrapStatus: BootstrapStatus;
  models: ModelSpec[];
  marketplace: MarketplaceApiSpec[];
  onAuthenticated: (user: UserProfile) => void;
}

type AuthMode = 'login' | 'register' | 'claim-admin';
type PortalView = 'auth' | 'explore' | 'api-detail' | 'docs';

export function AuthPortal({
  bootstrapStatus,
  models,
  marketplace,
  onAuthenticated,
}: AuthPortalProps) {
  const [mode, setMode] = useState<AuthMode>(
    !bootstrapStatus.adminExists ? 'claim-admin' : 'login',
  );
  const [view, setView] = useState<PortalView>('auth');
  const [selectedApiId, setSelectedApiId] = useState<ApiServiceId>('chat');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'claim-admin') {
        const res = await api.claimAdmin({
          name,
          email,
          password,
          passcode: bootstrapStatus.envPasscodeConfigured ? passcode : undefined,
        });
        setSessionToken(res.token);
        onAuthenticated(res.user);
      } else if (mode === 'register') {
        const res = await api.register({ name, email, password });
        setSessionToken(res.token);
        onAuthenticated(res.user);
      } else {
        const res = await api.login({ email, password });
        setSessionToken(res.token);
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const selectedApiSpec = marketplace.find((a) => a.id === selectedApiId) || marketplace[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 px-6 lg:px-10 bg-white border-b border-slate-200 flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <GlaxyesLogo className="w-7 h-7" />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900">
            Glaxyes AI
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setView('auth')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              view === 'auth' ? 'text-slate-900 underline underline-offset-4' : 'hover:text-slate-900'
            }`}
          >
            Console Access
          </button>
          <button
            type="button"
            onClick={() => setView('explore')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              view === 'explore' || view === 'api-detail'
                ? 'text-slate-900 underline underline-offset-4'
                : 'hover:text-slate-900'
            }`}
          >
            Explore APIs
          </button>
          <button
            type="button"
            onClick={() => setView('docs')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              view === 'docs' ? 'text-slate-900 underline underline-offset-4' : 'hover:text-slate-900'
            }`}
          >
            API Reference
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setView(view === 'explore' ? 'auth' : 'explore')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{view === 'explore' ? 'Sign In' : 'Explore APIs'}</span>
          </button>
        </div>
      </header>

      {view === 'explore' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
          <ExploreApisPage
            apis={marketplace}
            isAuthenticated={false}
            onSelectApi={(apiId) => {
              setSelectedApiId(apiId);
              setView('api-detail');
            }}
            onRequireAuth={() => setView('auth')}
          />
        </main>
      )}

      {view === 'api-detail' && selectedApiSpec && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
          <ApiDetailPage
            spec={selectedApiSpec}
            user={null}
            keys={[]}
            logs={[]}
            sessionApiKey=""
            onSessionApiKeyChange={() => {}}
            onBack={() => setView('explore')}
            onRefresh={async () => {}}
            onRequireAuth={() => setView('auth')}
          />
        </main>
      )}

      {view === 'docs' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
          <DocsPage models={models} />
        </main>
      )}

      {view === 'auth' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-medium text-blue-600 tracking-wide">
                Gemini-Powered API Marketplace · Cloud Run Ready
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight text-balance">
                Ship production AI endpoints on your own infrastructure.
              </h1>
              <p className="text-base text-slate-600 max-w-xl leading-relaxed">
                Explore Chat, Coding, Voice, Vision, Image, and Video APIs. Issue service-scoped{' '}
                <code className="font-mono text-xs bg-slate-200/70 px-1.5 py-0.5 rounded">glx_live_</code>{' '}
                API keys, enforce independent daily and monthly quotas, and keep upstream Gemini
                credentials strictly on the server.
              </p>
            </div>

            <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Glaxyes AI Unified Gateway</span>
                <span>Chat · Image · Video · Coding · Voice · Vision</span>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                <code>{`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : ''}/v1/chat/completions" \\
  -H "Authorization: Bearer glx_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-4-hydrogen",
    "messages": [{ "role": "user", "content": "Hello Glaxyes!" }]
  }'`}</code>
              </pre>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <KeyRound className="w-4 h-4 text-blue-600 mb-2" />
                <div className="text-sm font-semibold text-slate-900">Service-Scoped Keys</div>
                <p className="text-xs text-slate-500 mt-1">
                  Restrict individual keys to specific APIs or allow full platform access.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mb-2" />
                <div className="text-sm font-semibold text-slate-900">Per-API Quotas</div>
                <p className="text-xs text-slate-500 mt-1">
                  Independent UTC daily & monthly limits tracked per service.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <ShieldCheck className="w-4 h-4 text-slate-700 mb-2" />
                <div className="text-sm font-semibold text-slate-900">Server-Only Secrets</div>
                <p className="text-xs text-slate-500 mt-1">
                  Official Google Gen AI SDK runs exclusively on Node.js.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6">
                {!bootstrapStatus.adminExists && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('claim-admin');
                      setError(null);
                    }}
                    className={`flex-1 py-2 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      mode === 'claim-admin'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Claim Admin
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex-1 py-2 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`flex-1 py-2 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register
                </button>
              </div>

              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900">
                  {mode === 'claim-admin'
                    ? 'Initialize Admin Account'
                    : mode === 'register'
                      ? 'Create Developer Account'
                      : 'Sign In to Glaxyes AI'}
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {mode === 'claim-admin'
                    ? 'First-run setup: claim the root administrator account to manage quotas, users, and API keys.'
                    : mode === 'register'
                      ? 'Get instant Starter access across Chat, Coding, Voice, and Vision APIs.'
                      : 'Access your API marketplace, scoped keys, and telemetry.'}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {(mode === 'register' || mode === 'claim-admin') && (
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      required
                      minLength={2}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Work Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="developer@company.com"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={mode === 'login' ? 1 : 8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? 'Enter your password' : 'Minimum 8 characters'}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                {mode === 'claim-admin' && bootstrapStatus.envPasscodeConfigured && (
                  <div>
                    <label
                      htmlFor="auth-passcode"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Server Admin Passcode
                    </label>
                    <input
                      id="auth-passcode"
                      type="password"
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Configured ADMIN_PASSCODE secret"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  <span>
                    {loading
                      ? 'Authenticating...'
                      : mode === 'claim-admin'
                        ? 'Claim Admin Workspace'
                        : mode === 'register'
                          ? 'Create Developer Account'
                          : 'Sign In'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
