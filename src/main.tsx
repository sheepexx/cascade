import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted Inter (osu!lazer's freely-licensed fallback face). Bundled by Vite
// so it loads from our own origin - no render-blocking Google Fonts round-trip -
// and stays available offline. Weights mirror the old Google Fonts request.
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Remove the crawlable boot content (see index.html) the instant React has
// painted a frame. It shares the app's background and carries no visible UI, so
// dropping it with no transition means the hand-off shows no loading animation
// at all - the app simply appears.
requestAnimationFrame(() =>
  requestAnimationFrame(() => document.getElementById("boot")?.remove()),
);
