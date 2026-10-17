/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "1" only in a demo build (invented data, no network). Never set it in the production project. */
  readonly VITE_ADMIN_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
