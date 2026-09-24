import type JSZip from "jszip";
import { t } from "./i18n/core";

export type ArchiveLimits = {
  maxCompressedBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxExpandedBytes: number;
  maxCompressionRatio: number;
};

export const DEFAULT_ARCHIVE_LIMITS: Readonly<ArchiveLimits> = {
  maxCompressedBytes: 256 * 1024 * 1024,
  maxEntries: 4096,
  maxEntryBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  // DEFLATE tops out around 1032:1, and real assets get closer to that than you
  // would think: a flat-colour PNG or a stretch of near-silent WAV clears 200:1
  // easily. The absolute byte caps above are the real bomb protection.
  maxCompressionRatio: 1200,
};

type LoadedZipObject = JSZip.JSZipObject & { _data?: unknown };

/**
 * Sizes as recorded in the archive, or null when JSZip is holding the entry as
 * already-materialised content rather than a compressed record. It only does
 * that for empty entries, which cost nothing to expand.
 */
function entrySizes(
  entry: JSZip.JSZipObject,
): { expanded: number; compressed: number } | null {
  const data = (entry as LoadedZipObject)._data as
    | { compressedSize?: unknown; uncompressedSize?: unknown; length?: unknown }
    | null
    | undefined;
  if (!data || typeof data !== "object") return null;

  const expanded = data.uncompressedSize;
  const compressed = data.compressedSize;
  if (typeof expanded === "number" || typeof compressed === "number") {
    if (
      !Number.isSafeInteger(expanded) ||
      !Number.isSafeInteger(compressed) ||
      (expanded as number) < 0 ||
      (compressed as number) < 0
    ) {
      throw new Error(t("lib.archiveMeta"));
    }
    return { expanded: expanded as number, compressed: compressed as number };
  }

  if (typeof data.length === "number" && Number.isSafeInteger(data.length)) {
    return { expanded: data.length, compressed: data.length };
  }
  return null;
}

function inputBytes(data: Blob | ArrayBuffer | Uint8Array): number {
  return data instanceof Blob ? data.size : data.byteLength;
}

export function assertArchiveInputSize(
  data: Blob | ArrayBuffer | Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): number {
  const bytes = inputBytes(data);
  if (bytes > limits.maxCompressedBytes) {
    throw new Error(t("lib.archiveCompressed"));
  }
  return bytes;
}

export function assertSafeZip(
  zip: JSZip,
  compressedBytes: number,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): void {
  const entries = Object.values(zip.files);
  if (entries.length > limits.maxEntries) {
    throw new Error(t("lib.archiveEntries"));
  }

  let expandedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const sizes = entrySizes(entry);
    if (!sizes) continue;
    const { expanded, compressed } = sizes;
    if (expanded > limits.maxEntryBytes) {
      throw new Error(t("lib.archiveEntrySize"));
    }
    if (expanded > Math.max(1, compressed) * limits.maxCompressionRatio) {
      throw new Error(t("lib.archiveEntryRatio"));
    }
    expandedBytes += expanded;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.maxExpandedBytes) {
      throw new Error(t("lib.archiveTotal"));
    }
  }
  if (expandedBytes > Math.max(1, compressedBytes) * limits.maxCompressionRatio) {
    throw new Error(t("lib.archiveRatio"));
  }
}

export async function loadSafeZip(
  data: Blob | ArrayBuffer | Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<JSZip> {
  const compressedBytes = assertArchiveInputSize(data, limits);
  const { default: JSZipRuntime } = await import("jszip");
  const zip = await JSZipRuntime.loadAsync(data);
  assertSafeZip(zip, compressedBytes, limits);
  return zip;
}
