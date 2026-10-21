// Which environment the panel is connected to, shown in the shell. Built only from PUBLIC build settings, never a secret:
//   VITE_SUPABASE_URL           the project the app talks to (its first label is the project ref)
//   VITE_ADMIN_ENV              what the owner says this build is: "teste" or "producao"
//   VITE_ADMIN_PRODUCTION_REF   (optional) the ref of the production project, to CHECK that claim
// The environment of the app is not the same thing as the real/test flag of a record (a payment, a Pass): that one stays on every row.

export type EnvKind = 'demo' | 'teste' | 'producao' | 'inconsistente' | 'desconhecido';

export interface EnvInfo {
  kind: EnvKind;
  /** Short chip text. */
  label: string;
  /** One sentence for the tooltip and the login screen. */
  detail: string;
  /** The Supabase project ref the app is connected to (null in the demo or when the URL is missing). */
  ref: string | null;
}

export interface EnvInput {
  demo: boolean;
  supabaseUrl?: string;
  declared?: string;
  productionRef?: string;
}

/** "https://abcd1234.supabase.co" -> "abcd1234"; anything that is not a URL -> null. */
export function projectRef(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : host;
  } catch {
    return null;
  }
}

function declaredKind(v: string | undefined): 'teste' | 'producao' | null {
  const t = (v ?? '').trim().toLowerCase();
  if (['teste', 'test', 'staging', 'dev'].includes(t)) return 'teste';
  if (['producao', 'produção', 'production', 'prod'].includes(t)) return 'producao';
  return null;
}

export function describeEnvironment(i: EnvInput): EnvInfo {
  if (i.demo) return { kind: 'demo', label: 'Demonstração', detail: 'Dados inventados, sem rede: nada aqui é do jogo de verdade.', ref: null };
  const ref = projectRef(i.supabaseUrl);
  const short = ref ? ` (${ref})` : '';
  const prodRef = (i.productionRef ?? '').trim().toLowerCase() || null;
  const declared = declaredKind(i.declared);
  const isProdRef = prodRef !== null && ref !== null && ref.toLowerCase() === prodRef;

  if (isProdRef) {
    if (declared === 'teste') return { kind: 'inconsistente', label: 'Ambiente inconsistente', detail: `A build diz «teste», mas o projeto conectado${short} é o de produção configurado. Confira as variáveis do deploy antes de usar.`, ref };
    return { kind: 'producao', label: 'Produção', detail: `Conectado ao projeto de produção${short}. Números reais.`, ref };
  }
  if (declared === 'producao') {
    if (prodRef) return { kind: 'inconsistente', label: 'Ambiente inconsistente', detail: `A build diz «produção», mas o projeto conectado${short} não é o de produção configurado. Confira as variáveis do deploy antes de usar.`, ref };
    return { kind: 'producao', label: 'Produção (não verificada)', detail: `A build declara produção${short}, mas não há VITE_ADMIN_PRODUCTION_REF para conferir. Tratar como produção.`, ref };
  }
  if (declared === 'teste' || prodRef) return { kind: 'teste', label: 'Teste', detail: `Conectado a um projeto de teste${short}. Os números não são os do jogo aberto ao público.`, ref };
  return { kind: 'desconhecido', label: 'Ambiente não declarado', detail: `Esta build não diz se é teste ou produção${short}. Defina VITE_ADMIN_ENV no deploy (docs/ADMIN.md, seção 5).`, ref };
}

/** The settings of this build (read in one place, only the three public names). */
export function environmentFromBuild(demo: boolean): EnvInfo {
  return describeEnvironment({ demo, supabaseUrl: import.meta.env.VITE_SUPABASE_URL, declared: import.meta.env.VITE_ADMIN_ENV, productionRef: import.meta.env.VITE_ADMIN_PRODUCTION_REF });
}
