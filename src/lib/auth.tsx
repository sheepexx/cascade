import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setSupabaseToken } from "./supabase";
import { isDesktopApp } from "./pwa";
import { startDesktopLogin, watchDesktopLogin } from "./desktopAuth";

export type AuthUser = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
};

type AuthState = {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const WORKER = import.meta.env.VITE_WORKER_URL;
const REFRESH_MS = 50 * 60 * 1000;
const SESSION_TOKEN_KEY = "mania-editor:session-token";

let memorySessionToken: string | null = null;

function readSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) ?? memorySessionToken;
  } catch {
    return memorySessionToken;
  }
}

function storeSessionToken(token: string | null): void {
  memorySessionToken = token;
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
    else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
  }
}

export function sessionAuthHeaders(): Record<string, string> {
  const token = readSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function adoptSessionTokenFromUrl(): void {
  const hash = window.location.hash;
  if (!hash.startsWith("#session=")) return;
  storeSessionToken(decodeURIComponent(hash.slice("#session=".length)));
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const stored = readSessionToken();
      const res = await fetch(`${WORKER}/auth/session`, {
        credentials: "include",
        headers: stored ? { Authorization: `Bearer ${stored}` } : undefined,
      });
      const data = (await res.json()) as {
        user: AuthUser | null;
        supabaseToken?: string;
        sessionToken?: string;
      };
      if (data.user) {
        if (data.sessionToken) storeSessionToken(data.sessionToken);
      } else {
        storeSessionToken(null);
      }
      setSupabaseToken(data.user ? data.supabaseToken ?? null : null);
      setUser(data.user);
    } catch {
      // A temporary network failure is not a logout. Keep the last verified
      // session and retry on the next focus/refresh interval.
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(() => {
    if (isDesktopApp()) {
      void startDesktopLogin().catch((err) => {
        console.error("[cascade] could not open the osu! login", err);
      });
      return;
    }
    window.location.href = `${WORKER}/auth/osu/login`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${WORKER}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
    }
    storeSessionToken(null);
    setSupabaseToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    adoptSessionTokenFromUrl();
    const params = new URLSearchParams(window.location.search);
    if (params.has("auth") || window.location.hash.startsWith("#session=")) {
      params.delete("auth");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void watchDesktopLogin((session) => {
      storeSessionToken(session);
      void refresh();
    });
  }, [refresh]);

  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;
  useEffect(() => {
    const id = window.setInterval(() => {
      if (userRef.current) void refresh();
    }, REFRESH_MS);
    const onFocus = () => {
      if (userRef.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: !!user?.is_admin,
        loading,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
