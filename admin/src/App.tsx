import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, Notice, Skeleton, type IconName } from './components/ui';
import { AppContext } from './hooks';
import { type Access, resolveAccess } from './lib/auth';
import type { Backend } from './lib/backend';

const Overview = lazy(() => import('./pages/Overview'));
const Players = lazy(() => import('./pages/Players'));
const Legendaries = lazy(() => import('./pages/Legendaries'));
const Market = lazy(() => import('./pages/Market'));
const Economy = lazy(() => import('./pages/Economy'));
const League = lazy(() => import('./pages/League'));
const Waitlist = lazy(() => import('./pages/WaitlistPage'));

export const ROUTES: { id: string; label: string; icon: IconName }[] = [
  { id: 'visao-geral', label: 'Visão geral', icon: 'overview' },
  { id: 'jogadores', label: 'Jogadores', icon: 'players' },
  { id: 'lendarios', label: 'Lendários', icon: 'legendary' },
  { id: 'mercado', label: 'Mercado', icon: 'market' },
  { id: 'economia', label: 'Economia', icon: 'economy' },
  { id: 'liga', label: 'Liga', icon: 'league' },
  { id: 'espera', label: 'Lista de espera', icon: 'waitlist' },
];

const PAGES: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  'visao-geral': Overview,
  jogadores: Players,
  lendarios: Legendaries,
  mercado: Market,
  economia: Economy,
  liga: League,
  espera: Waitlist,
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

function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem('admin-theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
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
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>Arena Idle · Admin</span>
        </div>
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

function Shell({ backend, email, onSignOut }: { backend: Backend; email: string | null; onSignOut: () => void }) {
  const route = useRoute();
  const Page = PAGES[route];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            Arena Idle
            <small>Painel do dono{backend.demo ? ' · demonstração' : ''}</small>
          </span>
        </div>
        <nav className="nav" aria-label="Seções">
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} aria-current={r.id === route ? 'page' : undefined}>
              <Icon name={r.icon} />
              {r.label}
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
