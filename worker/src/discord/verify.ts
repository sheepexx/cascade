/**
 * Discord signs every interaction with the application's Ed25519 key. Anything
 * unsigned, signed by someone else, or older than five minutes is refused
 * before it is even parsed, which Discord also checks when the endpoint URL
 * is saved.
 */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_AGE_SECONDS = 300;

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const keys = new Map<string, Promise<CryptoKey>>();

function importKey(publicKeyHex: string): Promise<CryptoKey> {
  let key = keys.get(publicKeyHex);
  if (!key) {
    key = crypto.subtle.importKey("raw", hexBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    keys.set(publicKeyHex, key);
  }
  return key;
}

/** The request body when the signature holds, otherwise null. */
export async function verifyInteraction(
  req: Request,
  publicKeyHex: string,
  nowMs = Date.now(),
): Promise<string | null> {
  const signature = req.headers.get("X-Signature-Ed25519") ?? "";
  const timestamp = req.headers.get("X-Signature-Timestamp") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex)) return null;
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d{1,12}$/.test(timestamp)) return null;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return null;
  const length = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) return null;
  try {
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      await importKey(publicKeyHex.toLowerCase()),
      hexBytes(signature),
      new TextEncoder().encode(timestamp + body),
    );
    return ok ? body : null;
  } catch {
    return null;
  }
}
