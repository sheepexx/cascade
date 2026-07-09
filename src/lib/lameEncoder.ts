/**
 * Thin wrapper around the lamejs all-in-one bundle.
 *
 * Vite's CommonJS→ESM conversion loses free-variable references across
 * lamejs's internal modules (MPEGMode, Lame, BitStream, …).  Instead we
 * import the entire pre-bundled source as text and evaluate it once,
 * which keeps every module in a single scope.
 */

// Vite's ?raw import returns the file content as a string.
import _rawSrc from "lamejs/lame.all.js?raw";
import type { Mp3Encoder } from "lamejs";

type Mp3EncoderConstructor = typeof Mp3Encoder;
type LameGlobal = typeof globalThis & {
  __lamejs_enc?: Mp3EncoderConstructor;
};

let _loaded = false;

/** Ensure the bundle has been evaluated and the encoder is on globalThis. */
function ensure() {
  if (_loaded) return;
  // Append a capture so we can grab the lamejs function object after eval.
  const src =
    _rawSrc + "\nglobalThis.__lamejs_enc = lamejs.Mp3Encoder;\n";
  (0, eval)(src);
  _loaded = true;
}

/** Mp3Encoder class — constructor(channels, sampleRate, kbps). */
export function getMp3Encoder(): Mp3EncoderConstructor {
  ensure();
  const encoder = (globalThis as LameGlobal).__lamejs_enc;
  if (!encoder) throw new Error("lamejs Mp3Encoder failed to load");
  return encoder;
}
