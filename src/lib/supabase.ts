import type { SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

let currentToken: string | null = null;
let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;

export function setSupabaseToken(token: string | null): void {
  currentToken = token;
  try {
    client?.realtime.setAuth(token ?? ANON_KEY);
  } catch {
  }
}

export function getSupabaseToken(): string | null {
  return currentToken;
}

/**
 * The Supabase client, loaded on first use. The SDK is a fifth of the code
 * the app would otherwise parse before its first paint, and nothing on the
 * start screen needs it until a moment later, so it arrives as its own chunk
 * once something asks for it.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        console.warn(
          "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing at build " +
            "time - account & cloud features are disabled. Set them in the Vercel " +
            "project env and redeploy.",
        );
      }
      client = createClient(URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        accessToken: async () => currentToken ?? ANON_KEY,
      });
      if (currentToken) client.realtime.setAuth(currentToken);
      return client;
    });
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

/**
 * Subscribes once the client has loaded and returns the unsubscribe right
 * away, so an effect can clean up whether or not the channel ever opened.
 */
export function subscribeSupabase(
  open: (supabase: SupabaseClient) => ReturnType<SupabaseClient["channel"]>,
): () => void {
  let closed = false;
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;
  void getSupabase()
    .then((supabase) => {
      if (closed) return;
      channel = open(supabase);
    })
    .catch(() => {});
  return () => {
    closed = true;
    if (channel && client) void client.removeChannel(channel);
  };
}

export const MAPS_BUCKET = "maps";
