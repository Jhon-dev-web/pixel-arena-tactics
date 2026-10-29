import { defineConfig } from 'vitest/config';

// Headless balance tools (kept out of `npm test`; they print a report or generate a data file instead of asserting anything):
//   npm run sim     -> scripts/sim/progression.sim.ts  (14-day progression simulation)
//   npm run sim:cp  -> scripts/sim/cpTable.gen.ts      (regenerates src/game/recommendedCp.ts)
// scripts/tools/*.tool.ts are measurement tools run by hand (npx vitest run --config vitest.sim.config.ts <name>): they print a table and assert nothing.
// Shares the test setup (DebugPanel / localStorage stubs).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/sim/**/*.sim.ts', 'scripts/sim/**/*.gen.ts', 'scripts/tools/**/*.tool.ts'],
    setupFiles: ['src/game/__tests__/setup.ts'],
    testTimeout: 3_600_000, // npm run sim:long plays two 180-day seeds in one shard
  },
});
