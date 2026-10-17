import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A standalone app: its own package.json, its own build, its own Vercel project. Nothing is shared with the game or the portal.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // The strict CSP allows no inline script, so nothing may be inlined into the HTML.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600,
  },
  server: { port: 5225, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5225, strictPort: true, host: '127.0.0.1' },
});
