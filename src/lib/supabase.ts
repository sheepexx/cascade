import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client wired for our custom (osu!-via-Worker) auth.
 *
 * There is no Supabase Auth session. Instead the Worker mints a short-lived
 * Supabase JWT (see worker/src/index.ts); we hold the latest one here and hand
 * it to supabase-js through the `accessToken` hook, which uses it for both REST
 * (RLS) and Realtime. When signed out the hook falls back to the anon key.
 */

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let currentToken: string | null = null;

/** Update the active Supabase access token (null = signed out / anon). */
export function setSupabaseToken(token: string | null): void {
  currentToken = token;
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
