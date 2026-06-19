/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon (publishable) key. */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Cloudflare Worker base URL, e.g. https://mania-editor.noahcraft01.workers.dev */
  readonly VITE_WORKER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
