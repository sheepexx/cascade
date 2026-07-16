import { createClient } from "@supabase/supabase-js";

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

export function setSupabaseToken(token: string | null): void {
  currentToken = token;
  try {
    supabase.realtime.setAuth(token ?? ANON_KEY);
  } catch {
  }
}

export function getSupabaseToken(): string | null {
  return currentToken;
}

export const supabase = createClient(URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  accessToken: async () => currentToken ?? ANON_KEY,
});

export const MAPS_BUCKET = "maps";
