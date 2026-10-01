import type { LoadedFile } from "../types";
import { snapshotBlob } from "../lib/blobSnapshot";

export function decodeJwtClaims(
  token: string,
): { sub?: string; role?: string; exp?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function newLocalProjectId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `local-${random}`;
}

export async function loadFile(file: File): Promise<LoadedFile> {
  const blob = await snapshotBlob(file);
  return { name: file.name, url: URL.createObjectURL(blob), blob };
}

export function describeSaveError(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  if (err.name === "QuotaExceededError") {
    return "browser storage is full";
  }
  if (err.name === "AbortError" || err.name === "NotReadableError") {
    return "a source file changed on disk, re-add your audio/background files";
  }
  return err.message || err.name || null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    !!el?.isContentEditable
  );
}

export function blurActiveControl(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !document.getElementById("root")?.contains(el)) return;
  if (isTypingTarget(el) && (el as HTMLInputElement).type !== "range") return;
  if (typeof el.blur === "function") el.blur();
}

export function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes("Files");
}

export const isAudioFile = (f: File) =>
  f.type.startsWith("audio/") || /\.(mp3|ogg)$/i.test(f.name);
export const isImageFile = (f: File) =>
  f.type.startsWith("image/") || /\.(png|jpe?g|gif)$/i.test(f.name);
export const isVideoFile = (f: File) =>
  f.type.startsWith("video/") ||
  /\.(mp4|webm|avi|flv|mov|wmv|m4v|mpe?g)$/i.test(f.name);
export const isOszFile = (f: File) => /\.(osz|zip|mcz)$/i.test(f.name);
export const isOsuFile = (f: File) => /\.osu$/i.test(f.name);
export const isOskFile = (f: File) => /\.osk$/i.test(f.name);
export const isSmFile = (f: File) => /\.(sm|ssc)$/i.test(f.name);
export const isSingleChartFile = (f: File) => /\.(qua|mc)$/i.test(f.name);
