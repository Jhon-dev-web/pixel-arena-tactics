import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, Notice, Skeleton, type IconName } from './components/ui';
import { AppContext, useAsync, useInterval } from './hooks';
import { type Access, resolveAccess } from './lib/auth';
import type { Backend } from './lib/backend';
import { describeEnvironment, type EnvInfo } from './lib/environment';

const Overview = lazy(() => import('./pages/Overview'));
const Players = lazy(() => import('./pages/Players'));
const Legendaries = lazy(() => import('./pages/Legendaries'));
const Market = lazy(() => import('./pages/Market'));
const Economy = lazy(() => import('./pages/Economy'));
const League = lazy(() => import('./pages/League'));
const Waitlist = lazy(() => import('./pages/WaitlistPage'));
const AiOps = lazy(() => import('./pages/AiOps'));
const Pagamentos = lazy(() => import('./pages/Pagamentos'));
const Codes = lazy(() => import('./pages/Codes'));
const Tools = lazy(() => import('./pages/Tools'));
const TopLevel = lazy(() => import('./pages/TopLevel'));

/** The three screens of the menu (owner's request, 22/10/2026: organized, simple, few tabs). Every other page hangs under one of them. */
export type Section = 'visao-geral' | 'jogadores' | 'ferramentas';

export const NAV: { id: Section; label: string; icon: IconName }[] = [
  { id: 'visao-geral', label: 'Hoje', icon: 'home' },
  { id: 'jogadores', label: 'Jogadores', icon: 'players' },
  { id: 'ferramentas', label: 'Ferramentas', icon: 'tools' },
];

/** Every page of the app. The detail pages are opened from "Hoje" or "Ferramentas" and keep their old addresses, so links from the AI reports still work. */
export const ROUTES: { id: string; label: string; icon: IconName; section: Section }[] = [
  { id: 'visao-geral', label: 'Hoje', icon: 'home', section: 'visao-geral' },
  { id: 'jogadores', label: 'Jogadores', icon: 'players', section: 'jogadores' },
  { id: 'ferramentas', label: 'Ferramentas', icon: 'tools', section: 'ferramentas' },
  { id: 'lendarios', label: 'Lendários', icon: 'legendary', section: 'visao-geral' },
  { id: 'mercado', label: 'Mercado', icon: 'market', section: 'visao-geral' },
  { id: 'economia', label: 'Economia', icon: 'economy', section: 'visao-geral' },
  { id: 'liga', label: 'Liga', icon: 'league', section: 'visao-geral' },
  { id: 'espera', label: 'Lista de espera', icon: 'waitlist', section: 'visao-geral' },
  { id: 'pagamentos', label: 'Pagamentos a resolver', icon: 'economy', section: 'ferramentas' },
  { id: 'codigos', label: 'Códigos', icon: 'ticket', section: 'ferramentas' },
  { id: 'ia-operacao', label: 'IA e operação', icon: 'shield', section: 'ferramentas' },
  { id: 'premio-playtest', label: 'Prêmio do playtest', icon: 'league', section: 'ferramentas' },
];

const PAGES: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  'visao-geral': Overview,
  jogadores: Players,
  lendarios: Legendaries,
  mercado: Market,
  economia: Economy,
  liga: League,
  espera: Waitlist,
  pagamentos: Pagamentos,
  codigos: Codes,
  'ia-operacao': AiOps,
  ferramentas: Tools,
  'premio-playtest': TopLevel,
};

export function routeFromHash(hash: string): string {
  const id = hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return ROUTES.some((r) => r.id === id) ? id : 'visao-geral';
}

function useRoute(): string {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

type Theme = 'light' | 'dark' | 'auto';

/** Dark (night blue and gold) unless the owner picked the light theme with the button; the choice is remembered on this device. */
function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem('admin-theme');
    return t === 'light' || t === 'dark' ? t : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(t: Theme): void {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const dark = theme === 'dark' || (theme === 'auto' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  function toggle() {
    const next: Theme = dark ? 'light' : 'dark';
    setTheme(next);
    try {
      window.localStorage.setItem('admin-theme', next);
    } catch {
      /* private window: the choice just is not remembered */
    }
  }
  return (
    <button type="button" className="btn ghost" onClick={toggle} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'} title={dark ? 'Tema claro' : 'Tema escuro'}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

export function LoginScreen({ backend, onDone }: { backend: Backend; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await backend.auth.signIn(email.trim(), password);
    setBusy(false);
    if (r.ok) {
      setPassword('');
      onDone();
    } else setError(r.message);
  }
  return (
    <main className="center-screen">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand">
          <img className="brand-emblem" src="/emblem.png" alt="" width="28" height="28" />
          <span>Arena Idle · Admin</span>
        </div>
        <EnvChip env={envOf(backend)} />
        <h1>Entrar</h1>
        <p>Use a conta de administrador do jogo.</p>
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Senha</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}

export function DeniedScreen({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <main className="center-screen">
      <div className="card auth-card" role="alert">
        <span className="denied-mark" aria-hidden="true">
          !
        </span>
        <h1>Acesso negado</h1>
        <p>{email ? `A conta ${email} não é de administrador.` : 'Esta conta não é de administrador.'} Nenhum dado foi carregado.</p>
        <button type="button" className="btn primary" onClick={onSignOut}>
          Sair
        </button>
      </div>
    </main>
  );
}

export function ConfigMissing() {
  return (
    <main className="center-screen">
      <div className="card auth-card" role="alert">
        <h1>Configuração ausente</h1>
        <p>
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> nas variáveis de ambiente do projeto e faça um novo deploy (docs/ADMIN.md, seção 5).
        </p>
      </div>
    </main>
  );
}

/** What the panel is connected to, from public build settings. The real/test flag of each record stays on the record: this chip is about the app, not about a row. */
function envOf(backend: Backend): EnvInfo {
  return backend.env ?? describeEnvironment({ demo: backend.demo });
}

export function EnvChip({ env }: { env: EnvInfo }) {
  return (
    <div className={`env-chip env-${env.kind}`} role="status" title={env.detail}>
      <strong>{env.label}</strong>
      {env.ref ? <span className="mono">{env.ref.slice(0, 8)}</span> : null}
      <span className="sr-only">. {env.detail}</span>
    </div>
  );
}

/** The red number on "Ferramentas": open payments plus unread AI reports. A query that fails shows nothing here (the "Hoje" page says it could not check). */
function useToolsCount(): number {
  const pay = useAsync((api) => api.paymentExceptions({ status: 'open', page: 0, pageSize: 1 }), []);
  const ops = useAsync((api) => api.opsOverview(), []);
  useInterval(() => {
    pay.reload();
    ops.reload();
  }, 60_000);
  return (pay.data?.open ?? 0) + (ops.data?.open_reports ?? 0);
}

function Shell({ backend, email, onSignOut }: { backend: Backend; email: string | null; onSignOut: () => void }) {
  const route = useRoute();
  const Page = PAGES[route];
  const current = ROUTES.find((r) => r.id === route) ?? ROUTES[0];
  const parent = NAV.find((n) => n.id === current.section) ?? NAV[0];
  const toolsCount = useToolsCount();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-emblem" src="/emblem.png" alt="" width="28" height="28" />
          <span>
            Arena Idle
            <small>Administração</small>
          </span>
        </div>
        <EnvChip env={envOf(backend)} />
        <nav className="nav" aria-label="Seções">
          {NAV.map((r) => (
            <a key={r.id} href={`#/${r.id}`} aria-current={r.id === route ? 'page' : r.id === current.section ? 'location' : undefined}>
              <Icon name={r.icon} />
              {r.label}
              {r.id === 'ferramentas' && toolsCount > 0 ? (
                <span className="nav-count" title="pagamentos em aberto e relatórios da IA não lidos">
                  {toolsCount}
                  <span className="sr-only"> pendentes</span>
                </span>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="who" title={email ?? ''}>
            {email ?? 'administrador'}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <ThemeToggle />
            <button type="button" className="btn ghost" onClick={onSignOut} aria-label="Sair" title="Sair">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <main className="main" id="conteudo">
        {current.id !== parent.id ? (
          <nav className="crumb" aria-label="Caminho">
            <a href={`#/${parent.id}`}>
              <Icon name="back" />
              {parent.label}
            </a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{current.label}</span>
          </nav>
        ) : null}
        <Suspense fallback={<Skeleton height={240} />}>
          <Page />
        </Suspense>
      </main>
    </div>
  );
}

export default function App({ backend }: { backend: Backend }) {
  const [access, setAccess] = useState<Access | null>(null);

  const check = useCallback(async () => {
    const next = await resolveAccess(backend.auth);
    setAccess((prev) => (prev && prev.state === next.state && ('email' in prev ? prev.email : null) === ('email' in next ? next.email : null) ? prev : next));
  }, [backend]);

  useEffect(() => {
    void check();
    return backend.auth.onChange(() => void check());
  }, [backend, check]);

  const signOut = useCallback(async () => {
    await backend.auth.signOut();
    setAccess({ state: 'signed-out' });
  }, [backend]);

  const email = access && 'email' in access ? access.email : null;
  const onDenied = useCallback(() => setAccess({ state: 'denied', email }), [email]);
  const ctx = useMemo(() => ({ api: backend.api, onDenied, demo: backend.demo }), [backend, onDenied]);

  if (!access) {
    return (
      <main className="center-screen" aria-busy="true">
        <Skeleton height={20} width="180px" />
      </main>
    );
  }
  if (access.state === 'signed-out') return <LoginScreen backend={backend} onDone={() => void check()} />;
  if (access.state === 'denied') return <DeniedScreen email={access.email} onSignOut={() => void signOut()} />;
  if (access.state === 'error') {
    return (
      <main className="center-screen">
        <div className="card auth-card" role="alert">
          <h1>Não foi possível verificar o acesso</h1>
          <p>{access.message}</p>
          <button type="button" className="btn primary" onClick={() => void check()}>
            Tentar de novo
          </button>
          <button type="button" className="btn" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </main>
    );
  }
  return (
    <AppContext.Provider value={ctx}>
      <Shell backend={backend} email={access.email} onSignOut={() => void signOut()} />
    </AppContext.Provider>
  );
}
