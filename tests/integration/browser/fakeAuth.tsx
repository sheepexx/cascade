import type { ReactNode } from "react";
import type { AuthUser } from "../../../src/lib/auth";

/**
 * Replaces src/lib/auth.tsx in the harness: the signed-in user comes from the
 * page's query string (user, name) instead of the Worker's session, so a
 * test can open a window as anyone the backend knows.
 */

const params = new URLSearchParams(location.search);
const userId = params.get("user");

const user: AuthUser | null = userId
  ? {
      id: userId,
      osu_id: Number(params.get("osu") ?? 1),
      username: params.get("name") ?? "tester",
      avatar_url: null,
      is_admin: false,
    }
  : null;

export type { AuthUser };

export function sessionAuthHeaders(): Record<string, string> {
  return {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return {
    user,
    isAdmin: false,
    loading: false,
    login: () => {},
    logout: async () => {},
    refresh: async () => {},
  };
}
