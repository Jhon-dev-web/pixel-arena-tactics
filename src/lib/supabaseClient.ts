import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Phase 1 (account + persistence foundation) only. The frontend must NEVER hold anything but the
// anon/publishable key — RLS on the `characters` table is what actually protects the data (see
// supabase/migrations/0001_phase1_characters.sql). A service-role key must never be added here or to
// any VITE_-prefixed env var: Vite inlines every VITE_ variable into the client bundle.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = !!url && !!anonKey;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — running without a backend. ' +
      'Copy .env.example to .env.local and fill in your Supabase project values to enable accounts. ' +
      'See docs/backend-phase1.md.',
  );
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
