import type { MessageKey } from "./i18n/core";

/**
 * The app's side of signing in and of Connected accounts: reading what the
 * Worker hands back after a sign-in or a link, and the calls that add or
 * remove a way of signing in. Pure parts take their inputs so they can be
 * tested without a browser.
 */

export type LoginProvider = "osu" | "discord";

export const LOGIN_PROVIDERS: readonly LoginProvider[] = ["discord", "osu"];

export const PROVIDER_NAMES: Record<LoginProvider, string> = {
  osu: "osu!",
  discord: "Discord",
};

export function isLoginProvider(value: unknown): value is LoginProvider {
  return value === "osu" || value === "discord";
}

export type AuthErrorReason =
  | "cancelled"
  | "state"
  | "expired"
  | "exchange"
  | "profile"
  | "unavailable"
  | "reauth_mismatch"
  | "busy"
  | "network";

const ERROR_REASONS: readonly AuthErrorReason[] = [
  "cancelled",
  "state",
  "expired",
  "exchange",
  "profile",
  "unavailable",
  "reauth_mismatch",
  "busy",
  "network",
];

const ERROR_TEXT: Record<AuthErrorReason, MessageKey> = {
  cancelled: "auth.errorCancelled",
  state: "auth.errorState",
  expired: "auth.errorExpired",
  exchange: "auth.errorExchange",
  profile: "auth.errorExchange",
  unavailable: "auth.errorUnavailable",
  reauth_mismatch: "auth.errorMismatch",
  busy: "auth.errorBusy",
  network: "auth.errorNetwork",
};

/** What to tell someone about a sign-in that didn't work. */
export function authErrorText(
  t: (key: MessageKey, params?: Record<string, string>) => string,
  reason: AuthErrorReason,
  provider: LoginProvider | null,
): string {
  return t(ERROR_TEXT[reason], { provider: PROVIDER_NAMES[provider ?? "osu"] });
}

export type AuthReturn =
  | { kind: "session"; token: string }
  | { kind: "link"; token: string }
  | { kind: "error"; reason: AuthErrorReason; provider: LoginProvider | null };

function reason(value: string | null): AuthErrorReason {
  return (ERROR_REASONS as readonly string[]).includes(value ?? "") ? (value as AuthErrorReason) : "exchange";
}

/** What a page load brings back from the Worker's sign-in, if anything. */
export function readAuthReturn(href: string): AuthReturn | null {
  const url = new URL(href);
  const auth = url.searchParams.get("auth");
  const hash = url.hash.slice(1);
  if (hash.startsWith("session=")) {
    const token = decodeURIComponent(hash.slice("session=".length));
    return token ? { kind: "session", token } : null;
  }
  if (hash.startsWith("link=")) {
    const token = decodeURIComponent(hash.slice("link=".length));
    return token ? { kind: "link", token } : null;
  }
  if (auth === "error") {
    const provider = url.searchParams.get("provider");
    return {
      kind: "error",
      reason: reason(url.searchParams.get("reason")),
      provider: isLoginProvider(provider) ? provider : null,
    };
  }
  return null;
}

/** The same address without anything the sign-in added. */
export function withoutAuthReturn(href: string): string {
  const url = new URL(href);
  const hadAuth = url.searchParams.has("auth");
  url.searchParams.delete("auth");
  if (hadAuth) {
    url.searchParams.delete("reason");
    url.searchParams.delete("provider");
  }
  if (/^#(session|link)=/.test(url.hash)) url.hash = "";
  return url.pathname + url.search + url.hash;
}

/** The desktop listener hands over a session, `link:<token>` or `error:<reason>`. */
export function readDesktopPayload(payload: string): AuthReturn | null {
  if (!payload) return null;
  if (payload.startsWith("link:")) {
    const token = payload.slice("link:".length);
    return token ? { kind: "link", token } : null;
  }
  if (payload.startsWith("error:")) return { kind: "error", reason: reason(payload.slice("error:".length)), provider: null };
  return { kind: "session", token: payload };
}

/**
 * Which provider a link result is for, read from the token without trusting
 * it: the Worker checks the signature when the link is completed.
 */
export function linkTokenProvider(token: string): LoginProvider | null {
  try {
    const payload = token.split(".")[1] ?? "";
    const text = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const provider = (JSON.parse(text) as { provider?: unknown }).provider;
    return isLoginProvider(provider) ? provider : null;
  } catch {
    return null;
  }
}

/** A sign-in this browser started, and what to do once it comes back. */
export type PendingAuth = {
  at: number;
  intent: "login" | "link" | "reauth";
  provider: LoginProvider;
  /** After confirming it's you, the change that asked for it. */
  then?: { action: "link" | "unlink"; provider: LoginProvider };
};

const PENDING_KEY = "cascade:auth-pending";
/** A sign-in that takes longer than this was abandoned. */
export const PENDING_AUTH_MS = 15 * 60_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Local, not session, storage: on phones Discord can hand the consent screen
// to its app, which comes back to Cascade in a new tab. Other sites can't
// write it either way.
function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberPendingAuth(pending: PendingAuth, store: StorageLike | null = browserStorage()): void {
  try {
    store?.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Without session storage a sign-in still works; a link can't finish.
  }
}

/**
 * The sign-in this browser started, read once. A session or link result
 * arriving without one was not started here (a link someone sent), and is
 * ignored, so nobody can sign a visitor in to an account of their choosing.
 */
export function takePendingAuth(now = Date.now(), store: StorageLike | null = browserStorage()): PendingAuth | null | "unavailable" {
  if (!store) return "unavailable";
  try {
    const raw = store.getItem(PENDING_KEY);
    store.removeItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingAuth>;
    if (typeof value.at !== "number" || now - value.at > PENDING_AUTH_MS || now < value.at) return null;
    if (!isLoginProvider(value.provider)) return null;
    if (value.intent !== "login" && value.intent !== "link" && value.intent !== "reauth") return null;
    const then =
      value.then && (value.then.action === "link" || value.then.action === "unlink") && isLoginProvider(value.then.provider)
        ? { action: value.then.action, provider: value.then.provider }
        : undefined;
    return { at: value.at, intent: value.intent, provider: value.provider, then };
  } catch {
    return "unavailable";
  }
}

// ---------------------------------------------------------------------------
// The Worker's account routes
// ---------------------------------------------------------------------------

const WORKER = import.meta.env.VITE_WORKER_URL;

export type Identity = {
  provider: LoginProvider;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type Identities = {
  identities: Identity[];
  available: LoginProvider[];
  /** Signed in recently enough to change sign-in methods without confirming. */
  fresh: boolean;
};

export type LinkStart =
  | { kind: "go"; url: string }
  | { kind: "already_linked" }
  | { kind: "reauth"; via: LoginProvider | null };

export type LinkResult = "linked" | "already_linked" | "claimed" | "provider_taken" | "wrong_account" | "expired" | "failed";

export type UnlinkResult =
  | { kind: "unlinked" }
  | { kind: "last_identity" }
  | { kind: "reauth"; via: LoginProvider | null }
  | { kind: "failed" };

export class AccountRequestError extends Error {}

async function request(path: string, token: string | null, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  if (!WORKER) throw new AccountRequestError("no backend");
  if (!token) throw new AccountRequestError("signed out");
  const res = await fetch(`${WORKER}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

export async function fetchIdentities(token: string | null): Promise<Identities> {
  const { status, data } = await request("/auth/identities", token);
  if (status !== 200 || !Array.isArray(data.identities)) throw new AccountRequestError(String(data.error ?? status));
  return {
    identities: (data.identities as Identity[]).filter((i) => isLoginProvider(i.provider)),
    available: Array.isArray(data.available) ? data.available.filter(isLoginProvider) : [],
    fresh: data.fresh === true,
  };
}

export async function startAccountLink(
  token: string | null,
  provider: LoginProvider,
  intent: "link" | "reauth",
): Promise<LinkStart> {
  const { status, data } = await request("/auth/link/start", token, { provider, intent });
  if (status === 200 && typeof data.url === "string") return { kind: "go", url: data.url };
  if (status === 200 && data.status === "already_linked") return { kind: "already_linked" };
  if (status === 403 && data.error === "reauth_required") {
    return { kind: "reauth", via: isLoginProvider(data.via) ? data.via : null };
  }
  throw new AccountRequestError(String(data.error ?? status));
}

export async function completeAccountLink(token: string | null, linkToken: string): Promise<LinkResult> {
  const { status, data } = await request("/auth/link/complete", token, { token: linkToken });
  const result = data.status ?? data.error;
  if (status === 200 && (result === "linked" || result === "already_linked")) return result;
  if (result === "claimed" || result === "provider_taken" || result === "wrong_account" || result === "expired") {
    return result;
  }
  return "failed";
}

export async function unlinkAccount(token: string | null, provider: LoginProvider): Promise<UnlinkResult> {
  const { status, data } = await request("/auth/identities/unlink", token, { provider });
  if (status === 200 && data.status === "unlinked") return { kind: "unlinked" };
  if (data.status === "last_identity") return { kind: "last_identity" };
  if (status === 403 && data.error === "reauth_required") {
    return { kind: "reauth", via: isLoginProvider(data.via) ? data.via : null };
  }
  return { kind: "failed" };
}
