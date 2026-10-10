import { defineConfig } from 'vitest/config';

// Safety-net tests: pure game logic only, so a node environment is enough. The platform-injected
// window.DebugPanel and localStorage are stubbed in the setup file (the game never touches the DOM here).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/game/__tests__/setup.ts'],
  },
});
