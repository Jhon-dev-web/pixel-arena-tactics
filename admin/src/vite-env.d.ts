/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** What the owner says this build is: "teste" or "producao" (public; shown in the shell). */
  readonly VITE_ADMIN_ENV?: string;
  /** Optional: the ref of the production Supabase project, to check VITE_ADMIN_ENV against the connected project (public). */
  readonly VITE_ADMIN_PRODUCTION_REF?: string;
  /** "1" only in a demo build (invented data, no network). Never set it in the production project. */
  readonly VITE_ADMIN_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
