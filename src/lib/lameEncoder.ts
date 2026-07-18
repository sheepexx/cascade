import lameUrl from "lamejs/lame.all.js?url";
import type { Mp3Encoder } from "lamejs";

type Mp3EncoderConstructor = typeof Mp3Encoder;
type LameGlobal = typeof globalThis & {
  lamejs?: { Mp3Encoder?: Mp3EncoderConstructor };
};

let ctor: Mp3EncoderConstructor | null = null;
let loading: Promise<void> | null = null;

/**
 * lamejs ships as one concatenated script whose parts share implicit globals.
 * That leaves two dead ends: bundling it as a module breaks it at runtime
 * ("MPEGMode is not defined"), and eval'ing the source — what this used to do —
 * is refused by the production CSP (`script-src 'self' 'wasm-unsafe-eval'`),
 * which silently dropped every export to a WAV many times the size. Loading it
 * as a same-origin <script> satisfies 'self' and keeps its globals intact.
 *
 * Await once before encoding; `getMp3Encoder` stays synchronous after that.
 */
export function loadMp3Encoder(): Promise<void> {
  if (ctor) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      if (typeof document === "undefined") {
        reject(new Error("lamejs needs a document to load"));
        return;
      }
      const existing = (globalThis as LameGlobal).lamejs?.Mp3Encoder;
      if (existing) {
        ctor = existing;
        resolve();
        return;
      }
      const el = document.createElement("script");
      el.src = lameUrl;
      el.async = true;
      el.onload = () => {
        ctor = (globalThis as LameGlobal).lamejs?.Mp3Encoder ?? null;
        if (ctor) resolve();
        else reject(new Error("lamejs loaded without Mp3Encoder"));
      };
      el.onerror = () => reject(new Error("lamejs failed to load"));
      document.head.appendChild(el);
    }).catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export function getMp3Encoder(): Mp3EncoderConstructor {
  if (!ctor) throw new Error("lamejs Mp3Encoder is not loaded yet");
  return ctor;
}
