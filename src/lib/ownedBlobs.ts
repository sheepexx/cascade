/**
 * A copy of a Blob's bytes that no longer depends on where it came from, such
 * as a database record that is about to be deleted.
 */
export async function ownBlob(blob: Blob): Promise<Blob> {
  const bytes = await blob.arrayBuffer();
  if (typeof File !== "undefined" && blob instanceof File) {
    return new File([bytes], blob.name, { type: blob.type, lastModified: blob.lastModified });
  }
  return new Blob([bytes], { type: blob.type });
}
