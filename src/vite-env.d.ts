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

/** App version, injected from package.json at build time (see vite.config.ts). */
declare const __APP_VERSION__: string;

declare module "lamejs" {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
}
