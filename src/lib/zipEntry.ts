/**
 * Formats that are already compressed: audio, images and video. Deflating
 * them again saves almost nothing and is most of an export's wait, so they go
 * into archives stored as they are. Charts, .wav samples and other text still
 * compress.
 */
const PRECOMPRESSED =
  /\.(mp3|ogg|oga|opus|m4a|aac|flac|jpe?g|png|gif|webp|avif|mp4|m4v|webm|mov|avi|flv|wmv|mkv|mpe?g|zip|osz|osk|mcz)$/i;

export type ZipEntryOptions = { compression: "STORE" | "DEFLATE" };

export function zipEntryOptions(name: string): ZipEntryOptions {
  return { compression: PRECOMPRESSED.test(name) ? "STORE" : "DEFLATE" };
}
