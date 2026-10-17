import { defineConfig } from 'vitest/config';

// Safety-net tests: pure game logic only, so a node environment is enough. The platform-injected
// window.DebugPanel and localStorage are stubbed in the setup file (the game never touches the DOM here).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'supabase/functions/**/__tests__/**/*.test.ts'],
    // The public portal (portal/) is a separate, self-contained static site with its own scripts.
    exclude: ['portal/**', 'admin/**', '**/node_modules/**'],
    setupFiles: ['src/game/__tests__/setup.ts'],
    // The statistical tests (seeded drop rates, the recommended-CP table) run hundreds of thousands of rolls and sit close
    // to vitest's 5 s default on a busy machine, where they fail as timeouts rather than as wrong results.
    testTimeout: 60_000,
  },
});
