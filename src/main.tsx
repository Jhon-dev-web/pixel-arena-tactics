import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { AuthProvider } from "./auth/AuthContext";
import GameShell from "./shell/GameShell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <GameShell />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
