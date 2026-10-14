import "@fontsource/press-start-2p/latin-400.css"; // before App.css: its digit-range @font-face override must come later to win
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { AuthProvider } from "./auth/AuthContext";
import GameShell from "./shell/GameShell";
import { uiAudit } from "./lib/uiAudit";
import pt from "./locales/pt.json";
import { installGlobalErrorHandlers } from "./lib/errorLog";
import { captureBuyIntent } from "./game/passServer";

// Records uncaught errors and unhandled rejections into a small local ring buffer (Settings can copy it as a report for support). No network.
installGlobalErrorHandlers();

// The website links to /?comprar=passe: remember it (and clean the address bar) before the login screen can drop it.
captureBuyIntent();

// DEV only: `window.__uiAudit()` lists raw locale keys, NaN / undefined, horizontal overflow and unnamed buttons on the current screen (the same checker as `npm run smoke:ui`).
if (import.meta.env.DEV) {
  (window as unknown as { __uiAudit: () => ReturnType<typeof uiAudit> }).__uiAudit = () => uiAudit(Object.keys(pt));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <GameShell />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
