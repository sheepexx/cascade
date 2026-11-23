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
import {
  completeAccountLink,
  isLoginProvider,
  linkTokenProvider,
  readAuthReturn,
  readDesktopPayload,
  rememberPendingAuth,
  startAccountLink,
  takePendingAuth,
  unlinkAccount,
  withoutAuthReturn,
  type AuthErrorReason,
  type AuthReturn,
  type LoginProvider,
  type PendingAuth,
} from "./accountLinks";

export type { LoginProvider } from "./accountLinks";

export type AuthUser = {
  id: string;
  /** Null for an account made with Discord that hasn't connected osu!. */
  osu_id: number | null;
  username: string;
  /** What links to this account's profile use when its name is shared (migration 0047). */
  handle?: string;
  avatar_url: string | null;
  is_admin: boolean;
  /** How the account signs in. Missing from Workers older than Discord sign-in. */
  providers?: LoginProvider[];
  /** Whose name and avatar the profile follows: the provider it was made with. */
  profile_provider?: LoginProvider;
};

/**
 * The account's osu! username, when Cascade knows it: its name follows osu!.
 * An account named after its Discord account has none to offer, even with
 * osu! connected, so the map's Creator is asked for instead.
 */
export function osuUsername(user: AuthUser | null): string | null {
  if (!user || user.osu_id === null) return null;
  return user.profile_provider === "discord" ? null : user.username;
}

/** What came of the last sign-in, link or unlink, for the dialog or settings that show it. */
export type AuthNotice =
  | { kind: "error"; reason: AuthErrorReason; provider: LoginProvider | null; context: "login" | "account" }
  | {
      kind:
        | "linked"
        | "already_linked"
        | "unlinked"
        | "claimed"
        | "provider_taken"
        | "wrong_account"
        | "link_failed"
        | "last_identity";
      provider: LoginProvider;
      context: "account";
    }
  | {
      /** The change needs a fresh sign-in with `via` first. */
      kind: "reauth";
      provider: LoginProvider;
      via: LoginProvider | null;
      action: "link" | "unlink";
      context: "account";
    };

type AuthState = {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  /** Opens the choice of how to log in. */
  login: () => void;
  /** Leaves for a provider's sign-in (the browser, on desktop). */
  loginWith: (provider: LoginProvider) => Promise<void>;
  /** The providers this Cascade can sign in with right now. */
  loginProviders: LoginProvider[];
  loginOpen: boolean;
  closeLogin: () => void;
  /** A desktop sign-in waiting on the browser. */
  waiting: LoginProvider | null;
  cancelWaiting: () => void;
  notice: AuthNotice | null;
  clearNotice: () => void;
  /** Adds a way of signing in, confirming it's you first when needed. */
  connect: (provider: LoginProvider) => Promise<void>;
  /** Removes a way of signing in, confirming it's you first when needed. */
  disconnect: (provider: LoginProvider) => Promise<void>;
  /** Signs in again with `notice.via` and then carries on with the change. */
  confirmIdentity: () => Promise<void>;
  /** Runs before the page is left for a sign-in; App saves the open map. */
  setBeforeLogin: (run: (() => Promise<void>) | null) => void;
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

/** The session token, for the Worker's account routes, which take it in a header only. */
export function sessionToken(): string | null {
  return readSessionToken();
}

export function sessionAuthHeaders(): Record<string, string> {
  const token = readSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginProviders, setLoginProviders] = useState<LoginProvider[]>(["osu"]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [waiting, setWaiting] = useState<LoginProvider | null>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const beforeLoginRef = useRef<(() => Promise<void>) | null>(null);
  // The desktop app stays open through a sign-in, so it remembers in memory
  // what the browser round trip was for.
  const desktopPendingRef = useRef<PendingAuth | null>(null);

  const refresh = useCallback(async () => {
    try {
      const stored = readSessionToken();
      const res = await fetch(`${WORKER}/auth/session`, {
        credentials: "include",
        headers: stored ? { Authorization: `Bearer ${stored}` } : undefined,
      });
      // A failing Worker is not a sign-out: keep the last verified session.
      if (!res.ok) throw new Error(`session check failed (${res.status})`);
      const data = (await res.json()) as {
        user: AuthUser | null;
        supabaseToken?: string;
        sessionToken?: string;
        loginProviders?: unknown;
      };
      if (Array.isArray(data.loginProviders)) {
        const providers = data.loginProviders.filter(isLoginProvider);
        if (providers.length) setLoginProviders(providers);
      }
      if (data.user) {
        if (data.sessionToken) storeSessionToken(data.sessionToken);
      } else {
        storeSessionToken(null);
      }
      setSupabaseToken(data.user ? data.supabaseToken ?? null : null);
      setUser(data.user ? { ...data.user, osu_id: data.user.osu_id ?? null } : null);
    } catch {
      // A temporary network failure is not a logout. Keep the last verified
      // session and retry on the next focus/refresh interval.
    } finally {
      setLoading(false);
    }
  }, []);

  /** Leaves for a Worker sign-in address, remembering what it is for. */
  const leave = useCallback(async (url: string, pending: Omit<PendingAuth, "at">) => {
    const record = { ...pending, at: Date.now() };
    if (isDesktopApp()) {
      desktopPendingRef.current = record;
      await startDesktopLogin(url);
      setWaiting(pending.provider);
      return;
    }
    rememberPendingAuth(record);
    await beforeLoginRef.current?.().catch(() => {});
    window.location.href = url;
  }, []);

  const loginWith = useCallback(
    async (provider: LoginProvider) => {
      setNotice(null);
      try {
        await leave(`${WORKER}/auth/${provider}/login`, { intent: "login", provider });
      } catch (err) {
        console.error("[cascade] could not open the sign-in", err);
        setNotice({ kind: "error", reason: "network", provider, context: "login" });
      }
    },
    [leave],
  );

  const connect = useCallback(
    async (provider: LoginProvider) => {
      setNotice(null);
      try {
        const started = await startAccountLink(readSessionToken(), provider, "link");
        if (started.kind === "go") return leave(started.url, { intent: "link", provider });
        if (started.kind === "already_linked") {
          setNotice({ kind: "already_linked", provider, context: "account" });
          return;
        }
        setNotice({ kind: "reauth", provider, via: started.via, action: "link", context: "account" });
      } catch {
        setNotice({ kind: "link_failed", provider, context: "account" });
      }
    },
    [leave],
  );

  const disconnect = useCallback(
    async (provider: LoginProvider) => {
      setNotice(null);
      try {
        const result = await unlinkAccount(readSessionToken(), provider);
        if (result.kind === "unlinked") {
          setNotice({ kind: "unlinked", provider, context: "account" });
          await refresh();
        } else if (result.kind === "last_identity") {
          setNotice({ kind: "last_identity", provider, context: "account" });
        } else if (result.kind === "reauth") {
          setNotice({ kind: "reauth", provider, via: result.via, action: "unlink", context: "account" });
        } else {
          setNotice({ kind: "link_failed", provider, context: "account" });
        }
      } catch {
        setNotice({ kind: "link_failed", provider, context: "account" });
      }
    },
    [refresh],
  );

  const noticeRef = useRef(notice);
  noticeRef.current = notice;

  const confirmIdentity = useCallback(async () => {
    const current = noticeRef.current;
    if (current?.kind !== "reauth" || !current.via) return;
    try {
      const started = await startAccountLink(readSessionToken(), current.via, "reauth");
      if (started.kind !== "go") throw new Error("could not confirm");
      await leave(started.url, {
        intent: "reauth",
        provider: current.via,
        then: { action: current.action, provider: current.provider },
      });
    } catch {
      setNotice({ kind: "link_failed", provider: current.provider, context: "account" });
    }
  }, [leave]);

  /** Finishes whatever a sign-in round trip brought back. */
  const handleReturn = useCallback(
    async (result: AuthReturn, pending: PendingAuth | null) => {
      if (result.kind === "error") {
        const context = pending && pending.intent !== "login" ? "account" : "login";
        setNotice({ kind: "error", reason: result.reason, provider: result.provider ?? pending?.provider ?? null, context });
        if (context === "login") setLoginOpen(true);
        await refresh();
        return;
      }
      if (result.kind === "session") {
        storeSessionToken(result.token);
        await refresh();
        setLoginOpen(false);
        // Confirmed it's you: carry on with the change that asked for it.
        if (pending?.then?.action === "link") await connect(pending.then.provider);
        else if (pending?.then?.action === "unlink") await disconnect(pending.then.provider);
        return;
      }
      await refresh();
      const provider = linkTokenProvider(result.token) ?? pending?.provider ?? "discord";
      const linked = await completeAccountLink(readSessionToken(), result.token).catch(() => "failed" as const);
      setNotice({
        kind: linked === "failed" || linked === "expired" ? "link_failed" : linked,
        provider,
        context: "account",
      });
      if (linked === "linked") await refresh();
    },
    [connect, disconnect, refresh],
  );

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

  // Back from a sign-in on the web: the address carries the result.
  const handledRef = useRef(false);
  useEffect(() => {
    if (handledRef.current) {
      void refresh();
      return;
    }
    handledRef.current = true;
    const result = readAuthReturn(window.location.href);
    if (result || new URLSearchParams(window.location.search).has("auth")) {
      window.history.replaceState({}, "", withoutAuthReturn(window.location.href));
    }
    const pending = result ? takePendingAuth() : null;
    // A result this browser didn't ask for (a link someone sent) is ignored,
    // so nobody can sign a visitor in to an account of their choosing.
    if (result && pending !== null) {
      void handleReturn(result, pending === "unavailable" ? null : pending);
    } else {
      void refresh();
    }
  }, [handleReturn, refresh]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void watchDesktopLogin((payload) => {
      const result = readDesktopPayload(payload);
      const pending = desktopPendingRef.current;
      desktopPendingRef.current = null;
      setWaiting(null);
      if (result) void handleReturn(result, pending);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [handleReturn]);

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

  const login = useCallback(() => {
    setNotice((current) => (current?.context === "login" ? null : current));
    setLoginOpen(true);
  }, []);
  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    setWaiting(null);
    setNotice((current) => (current?.context === "login" ? null : current));
  }, []);
  const cancelWaiting = useCallback(() => {
    desktopPendingRef.current = null;
    setWaiting(null);
  }, []);
  const clearNotice = useCallback(() => setNotice(null), []);
  const setBeforeLogin = useCallback((run: (() => Promise<void>) | null) => {
    beforeLoginRef.current = run;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: !!user?.is_admin,
        loading,
        login,
        loginWith,
        loginProviders,
        loginOpen,
        closeLogin,
        waiting,
        cancelWaiting,
        notice,
        clearNotice,
        connect,
        disconnect,
        confirmIdentity,
        setBeforeLogin,
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
