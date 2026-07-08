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

let _loaded = false;

/** Ensure the bundle has been evaluated and the encoder is on globalThis. */
function ensure() {
  if (_loaded) return;
  // Append a capture so we can grab the lamejs function object after eval.
  const src =
    _rawSrc + "\nglobalThis.__lamejs_enc = lamejs.Mp3Encoder;\n";
  eval(src);
  _loaded = true;
}

/** Mp3Encoder class — constructor(channels, sampleRate, kbps). */
export function getMp3Encoder(): any {
  ensure();
  return (globalThis as any).__lamejs_enc;
}
