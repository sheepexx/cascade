import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/quicksand/400.css";
import "@fontsource/quicksand/500.css";
import "@fontsource/quicksand/600.css";
import "@fontsource/quicksand/700.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { LocaleProvider } from "./lib/i18n";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LocaleProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LocaleProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

requestAnimationFrame(() =>
  requestAnimationFrame(() => document.getElementById("boot")?.remove()),
);
