import "@fontsource/press-start-2p/latin-400.css"; // before App.css: its digit-range @font-face override must come later to win
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { AuthProvider } from "./auth/AuthContext";
import GameShell from "./shell/GameShell";
import OpsBanner from "./components/OpsBanner";
import { uiAudit } from "./lib/uiAudit";
import pt from "./locales/pt.json";
import { installGlobalErrorHandlers } from "./lib/errorLog";
import { captureBuyIntent } from "./game/passServer";
import { captureInvite } from "./lib/inviteMemory";
import { applyMotionPref } from "./lib/motionPref";
import { installNetStats } from "./lib/netStats";

// Records uncaught errors and unhandled rejections into a small local ring buffer (Settings can copy it as a report for support). No network.
installGlobalErrorHandlers();

// The player's own "reduce motion" switch (Settings) is put on the page before the first paint; the system setting needs no code (the CSS media queries read it).
applyMotionPref();

// The website links to /?comprar=passe: remember it (and clean the address bar) before the login screen can drop it.
captureBuyIntent();

// The invite link (/?ref=CODE): the code is kept in MEMORY only (nothing saved in the browser) and taken out of the address bar; the login screen and the sign-up use it.
captureInvite();

// DEV only: `window.__uiAudit()` lists raw locale keys, NaN / undefined, horizontal overflow and unnamed buttons on the current screen (the same checker as `npm run smoke:ui`).
if (import.meta.env.DEV) {
  (window as unknown as { __uiAudit: () => ReturnType<typeof uiAudit> }).__uiAudit = () => uiAudit(Object.keys(pt));
  // DEV only: `window.__netStats.perMinute()` / `.total()` / `.perHour()` count the requests to the server by kind (lib/netStats.ts).
  installNetStats(window);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <OpsBanner />
        <GameShell />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
