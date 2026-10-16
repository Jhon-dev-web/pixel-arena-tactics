import { isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * The player market (SOL) and the USDC Pass (Solana): shipped switched OFF. They exist only in the WEB build (Valve forbids crypto trading in a Steam game), only with a backend, and only when the owner sets
 * VITE_MARKET_ENABLED=true (a build variable: redeploy after changing it). The desktop build forces the variable to "false" (vite.config.ts), so everything behind this constant is removed from
 * its bundle; `npm run check:desktop` fails if any of it survives.
 */
export const marketEnabled: boolean = import.meta.env.VITE_MARKET_ENABLED === 'true' && isSupabaseConfigured;
