import type { ReactNode } from "react";
import type { AuthUser, LoginProvider } from "../../../src/lib/auth";

/**
 * Replaces src/lib/auth.tsx in the harness: the signed-in user comes from the
 * page's query string (user, name, osu) instead of the Worker's session, so a
 * test can open a window as anyone the backend knows. `osu=none` is an
 * account made with Discord that has no osu! account.
 */

const params = new URLSearchParams(location.search);
const userId = params.get("user");
const osu = params.get("osu");

const user: AuthUser | null = userId
  ? {
      id: userId,
      osu_id: osu === "none" ? null : Number(osu ?? 1),
      username: params.get("name") ?? "tester",
      avatar_url: null,
      is_admin: false,
      providers: osu === "none" ? ["discord"] : ["osu"],
    }
  : null;

export type { AuthUser, LoginProvider };

export function sessionAuthHeaders(): Record<string, string> {
  return {};
}

export function sessionToken(): string | null {
  return null;
}

export function osuUsername(account: AuthUser | null): string | null {
  if (!account || account.osu_id === null) return null;
  return account.profile_provider === "discord" ? null : account.username;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const noop = () => {};
const done = async () => {};

export function useAuth() {
  return {
    user,
    isAdmin: false,
    loading: false,
    login: noop,
    loginWith: done,
    loginProviders: ["osu", "discord"] as LoginProvider[],
    loginOpen: false,
    closeLogin: noop,
    waiting: null,
    cancelWaiting: noop,
    notice: null,
    clearNotice: noop,
    connect: done,
    disconnect: done,
    confirmIdentity: done,
    setBeforeLogin: noop,
    logout: done,
    refresh: done,
  };
}
