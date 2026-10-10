import { vi } from 'vitest';

// tunables.ts reads window.DebugPanel at import time (injected by the deploy platform; index.html ships a local
// shim). This is the same shim: a node with a `value` collapses to that value, any other object is walked.
type Schema = { [key: string]: unknown };
function resolve(node: unknown): unknown {
  if (node && typeof node === 'object') {
    if ('value' in node) return (node as { value: unknown }).value;
    const out: Schema = {};
    for (const k in node as Schema) out[k] = resolve((node as Schema)[k]);
    return out;
  }
  return node;
}

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  get length(): number {
    return this.data.size;
  }
}

const g = globalThis as unknown as Record<string, unknown>;
g.window = g.window ?? globalThis;
(g.window as Record<string, unknown>).DebugPanel = { define: resolve };
g.localStorage = new MemoryStorage();

// saveRepository.ts imports the Supabase client, which would read VITE_SUPABASE_* from a developer's local .env.
vi.mock('../../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }));
