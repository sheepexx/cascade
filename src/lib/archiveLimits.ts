import type JSZip from "jszip";

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
  maxCompressionRatio: 200,
};

type LoadedZipObject = JSZip.JSZipObject & {
  _data?: { compressedSize?: number; uncompressedSize?: number };
};

function inputBytes(data: Blob | ArrayBuffer | Uint8Array): number {
  return data instanceof Blob ? data.size : data.byteLength;
}

export function assertArchiveInputSize(
  data: Blob | ArrayBuffer | Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): number {
  const bytes = inputBytes(data);
  if (bytes > limits.maxCompressedBytes) {
    throw new Error("Archive exceeds the compressed size limit.");
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
    throw new Error("Archive contains too many entries.");
  }

  let expandedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const data = (entry as LoadedZipObject)._data;
    const expanded = data?.uncompressedSize;
    const compressed = data?.compressedSize;
    if (
      !Number.isSafeInteger(expanded) ||
      !Number.isSafeInteger(compressed) ||
      expanded === undefined ||
      compressed === undefined ||
      expanded < 0 ||
      compressed < 0
    ) {
      throw new Error("Archive entry size metadata is invalid.");
    }
    if (expanded > limits.maxEntryBytes) {
      throw new Error("Archive entry exceeds the expanded size limit.");
    }
    if (expanded > Math.max(1, compressed) * limits.maxCompressionRatio) {
      throw new Error("Archive entry exceeds the compression ratio limit.");
    }
    expandedBytes += expanded;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.maxExpandedBytes) {
      throw new Error("Archive exceeds the total expanded size limit.");
    }
  }
  if (expandedBytes > Math.max(1, compressedBytes) * limits.maxCompressionRatio) {
    throw new Error("Archive exceeds the compression ratio limit.");
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
