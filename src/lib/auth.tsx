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

/** Authenticated osu! user, as stored in `public.users`. */
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
  /** True until the first session check resolves. */
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Re-fetch the session + Supabase token from the Worker. */
  refresh: () => Promise<void>;
};

const WORKER = import.meta.env.VITE_WORKER_URL;
// Supabase tokens last 1h; refresh comfortably before that.
const REFRESH_MS = 50 * 60 * 1000;

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${WORKER}/auth/session`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        user: AuthUser | null;
        supabaseToken?: string;
      };
      setSupabaseToken(data.user ? data.supabaseToken ?? null : null);
      setUser(data.user);
    } catch {
      setSupabaseToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(() => {
    window.location.href = `${WORKER}/auth/osu/login`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${WORKER}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore network errors; we clear locally regardless */
    }
    setSupabaseToken(null);
    setUser(null);
  }, []);

  // Initial session check. Also strips the `?auth=ok|error` marker the Worker
  // appends when bouncing back from the OAuth flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("auth")) {
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

  // Keep the Supabase token fresh while signed in, and re-check on tab focus.
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
