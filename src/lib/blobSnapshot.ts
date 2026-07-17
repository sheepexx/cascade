export async function snapshotBlob(blob: Blob): Promise<Blob> {
  if (!(blob instanceof File)) return blob;
  try {
    return new Blob([await blob.arrayBuffer()], { type: blob.type });
  } catch {
    return blob;
  }
}

export async function snapshotBlobMap(
  map: Record<string, Blob>,
): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  for (const [name, blob] of Object.entries(map)) {
    out[name] = await snapshotBlob(blob);
  }
  return out;
}
