import { defineConfig } from 'vitest/config';

// Headless progression simulation (npm run sim). Kept out of `npm test`: it takes a while and prints a report
// instead of asserting anything. Shares the test setup (DebugPanel / localStorage stubs).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/sim/**/*.sim.ts'],
    setupFiles: ['src/game/__tests__/setup.ts'],
    testTimeout: 600_000,
  },
});
