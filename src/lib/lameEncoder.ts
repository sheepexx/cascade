import _rawSrc from "lamejs/lame.all.js?raw";
import type { Mp3Encoder } from "lamejs";

type Mp3EncoderConstructor = typeof Mp3Encoder;
type LameGlobal = typeof globalThis & {
  __lamejs_enc?: Mp3EncoderConstructor;
};

let _loaded = false;

function ensure() {
  if (_loaded) return;
  const src =
    _rawSrc + "\nglobalThis.__lamejs_enc = lamejs.Mp3Encoder;\n";
  (0, eval)(src);
  _loaded = true;
}

export function getMp3Encoder(): Mp3EncoderConstructor {
  ensure();
  const encoder = (globalThis as LameGlobal).__lamejs_enc;
  if (!encoder) throw new Error("lamejs Mp3Encoder failed to load");
  return encoder;
}
