/**
 * Handing a Map Card to the system share sheet (Windows share, macOS and
 * mobile share sheets), where the browser can share image files.
 */

function probeFile(): File | null {
  try {
    return new File([new Uint8Array(0)], "card.png", { type: "image/png" });
  } catch {
    return null;
  }
}

/** True where `navigator.share` accepts a PNG. */
export function canShareImages(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  const file = probeFile();
  try {
    return !!file && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Opens the share sheet; "cancelled" when the mapper closed it. */
export async function shareImage(
  blob: Blob,
  filename: string,
  title: string,
): Promise<"shared" | "cancelled"> {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  try {
    await navigator.share({ files: [file], title });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}
