import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client wired for our custom (osu!-via-Worker) auth.
 *
 * There is no Supabase Auth session. Instead the Worker mints a short-lived
 * Supabase JWT (see worker/src/index.ts); we hold the latest one here and hand
 * it to supabase-js through the `accessToken` hook, which uses it for both REST
 * (RLS) and Realtime. When signed out the hook falls back to the anon key.
 */

// Fall back to harmless placeholders if the env vars are missing (e.g. a build
// made before they were configured). This keeps the editor from white-screening
// on createClient(); account/cloud calls simply fail and are caught.
const URL = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing at build " +
      "time — account & cloud features are disabled. Set them in the Vercel " +
      "project env and redeploy.",
  );
}

let currentToken: string | null = null;

/** Update the active Supabase access token (null = signed out / anon). */
export function setSupabaseToken(token: string | null): void {
  currentToken = token;
  // Keep Realtime authorized with the same token so private channels (used for
  // co-op editing) accept this user; fall back to anon when signed out.
  try {
    supabase.realtime.setAuth(token ?? ANON_KEY);
  } catch {
    /* realtime not ready yet — initial auth is applied on first connect */
  }
}

export function getSupabaseToken(): string | null {
  return currentToken;
}

export const supabase = createClient(URL, ANON_KEY, {
  // We manage identity ourselves; disable the built-in auth machinery.
  auth: { persistSession: false, autoRefreshToken: false },
  accessToken: async () => currentToken ?? ANON_KEY,
});

/** Storage bucket holding per-user audio / background blobs. */
export const MAPS_BUCKET = "maps";
