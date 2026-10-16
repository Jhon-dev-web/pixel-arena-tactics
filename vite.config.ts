import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const appVersion = (JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string }).version;

// Desktop (Electron/Steam) build only: `vite build --mode desktop` (see scripts/desktop-build.mjs).
// Turns index.html into a page that satisfies the packaged app's strict CSP and needs no network:
//  - moves the inline <style>/<script> blocks into same-origin files (the CSP forbids inline code),
//  - drops the iframe size-reporting script (only meaningful when embedded in the web platform).
// The web build never loads this plugin, so its output is unchanged.
function desktopHtml(): Plugin {
  // The folder is the one Vite resolved for this build (dist-desktop by default; a check can build somewhere else).
  let outDir = "dist-desktop";
  return {
    name: "arena-desktop-html",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = path.resolve(outDir, "index.html");
      let html = fs.readFileSync(file, "utf8");
      let n = 0;
      html = html.replace(/<style>([\s\S]*?)<\/style>/g, (_m, css: string) => {
        const name = `desktop-inline-${n++}.css`;
        fs.writeFileSync(path.resolve(outDir, name), css.trim() + "\n");
        return `<link rel="stylesheet" href="./${name}" />`;
      });
      html = html.replace(/<script>([\s\S]*?)<\/script>/g, (_m, js: string) => {
        if (js.includes("GAME_SIZE_RESPONSE")) return "";
        const name = `desktop-inline-${n++}.js`;
        fs.writeFileSync(path.resolve(outDir, name), js.trim() + "\n");
        return `<script src="./${name}"></script>`;
      });
      fs.writeFileSync(file, html);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";
  return {
    plugins: [react(), ...(desktop ? [desktopHtml()] : [])],
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
    base: "./",
    // The game version, shown in the error report (src/lib/errorLog.ts). The desktop branch below spreads its own define on top of this one.
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    // Desktop build: never read .env* files (a developer's .env.local must not leak into a shipped
    // bundle) and force the backend variables empty so the packaged game runs fully local.
    ...(desktop
      ? {
          envDir: false as const,
          define: {
            __APP_VERSION__: JSON.stringify(appVersion),
            "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
            "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
            // The player market (crypto, web only: Valve forbids crypto trading) is compiled out of the desktop build, whatever the environment says. `npm run check:desktop` verifies it.
            "import.meta.env.VITE_MARKET_ENABLED": JSON.stringify("false"),
          },
        }
      : {}),
    build: {
      outDir: desktop ? "dist-desktop" : "dist",
      // Skip gzip-size reporting: our users don't optimize by bundle size,
      // and it only slows the build. Output is byte-identical.
      reportCompressedSize: false,
      // Game bundles (three/phaser) legitimately ship 1-3MB single chunks, so
      // the default 500 kB advisory fires on every build as noise. Keep the
      // warning only for genuinely pathological (5MB+) chunks.
      chunkSizeWarningLimit: 5000,
    },
  };
});
