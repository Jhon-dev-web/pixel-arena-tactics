import type { EdgeEnv } from '../env.ts';
import { createFlagReader, type OpsFlagReader } from './flags.ts';
import { createErrorReporter, type ErrorReporter } from './monitor.ts';

// What an index.ts needs to join the operations layer: the flag reader (pauses) and the 5xx reporter (the watchdog's eyes). Both are inert when the platform variables are missing.
export interface OpsWiring {
  flags: OpsFlagReader;
  report: ErrorReporter | null;
}

export function opsWiring(env: EdgeEnv): OpsWiring {
  const supabaseUrl = env.SUPABASE_URL ?? '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return {
    flags: createFlagReader({ supabaseUrl, apiKey: serviceRoleKey }),
    report: createErrorReporter({ supabaseUrl, serviceRoleKey }),
  };
}
