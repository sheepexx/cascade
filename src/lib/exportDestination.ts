import { isDesktopApp } from "./pwa";
import {
  loadExportFolderHandle,
  saveExportFolderHandle,
} from "./persistence";

/**
 * Where exports are saved, and the one way every export is saved.
 *
 * Desktop writes into Downloads or a folder picked in Settings, and knows the
 * full path. A browser that lets a page write to a folder (Chrome, Edge) can
 * use one picked in Settings, but only ever tells the page its name. Any other
 * browser downloads the file, and the browser decides where it goes.
 *
 * Sending a map to osu! does not come through here.
 */

/** Where one export ended up. */
export type ExportLocation =
  /** Desktop: the folder and the file's full path. */
  | { kind: "path"; folder: string; path: string }
  /** A folder picked in the browser, known by name only. */
  | { kind: "folder"; folder: string }
  /** The browser's own downloads. */
  | { kind: "browser" };

export type ExportSaved = {
  /** The name it was saved under, which a clash may have numbered. */
  fileName: string;
  location: ExportLocation;
  /** The chosen folder could not be used, so it went to the default place. */
  fellBack: boolean;
};

export type ExportFolderInfo = {
  /** Whether this device can pick a folder at all. */
  supported: boolean;
  /** False while exports go to the default place. */
  chosen: boolean;
  /** Desktop: the full path. Browser: the picked folder's name, or null for
   *  the browser's downloads. */
  label: string | null;
};

export type ExportTarget =
  | { kind: "desktop" }
  | { kind: "folder"; handle: FileSystemDirectoryHandle }
  | { kind: "browser"; fellBack: boolean };

type DesktopFolder = { path: string; chosen: boolean };
type DesktopWritten = { path: string; folder: string; fellBack: boolean };

type WritePermission = "granted" | "denied" | "prompt";
type PermissionedHandle = FileSystemDirectoryHandle & {
  queryPermission?: (desc: { mode: "readwrite" }) => Promise<WritePermission>;
  requestPermission?: (desc: { mode: "readwrite" }) => Promise<WritePermission>;
};
type PickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
};

const listeners = new Set<(saved: ExportSaved) => void>();

/** Hears about every export once it is saved, to say where it went. */
export function onExportSaved(listener: (saved: ExportSaved) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function invoke<T>(
  command: string,
  args?: Record<string, unknown> | Uint8Array,
  options?: { headers: Record<string, string> },
): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(command, args, options);
}

const fromDesktop = (folder: DesktopFolder): ExportFolderInfo => ({
  supported: true,
  chosen: folder.chosen,
  label: folder.path,
});

/** Whether this browser lets a page write into a folder the user picks. */
export function canPickBrowserFolder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as PickerWindow).showDirectoryPicker === "function"
  );
}

let cachedHandle: FileSystemDirectoryHandle | null | undefined;

async function browserFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (cachedHandle === undefined) {
    cachedHandle = await loadExportFolderHandle().catch(() => null);
  }
  return cachedHandle;
}

export async function exportFolderInfo(): Promise<ExportFolderInfo> {
  if (isDesktopApp()) return fromDesktop(await invoke<DesktopFolder>("export_folder"));
  if (!canPickBrowserFolder()) return { supported: false, chosen: false, label: null };
  const handle = await browserFolder();
  return { supported: true, chosen: !!handle, label: handle?.name ?? null };
}

/** Asks for a folder. Null when the picker was closed without one. */
export async function chooseExportFolder(): Promise<ExportFolderInfo | null> {
  if (isDesktopApp()) {
    const picked = await invoke<DesktopFolder | null>("export_choose_folder");
    return picked ? fromDesktop(picked) : null;
  }
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ id: "cascade-exports", mode: "readwrite", startIn: "downloads" });
  } catch (error) {
    if ((error as DOMException | null)?.name === "AbortError") return null;
    throw error;
  }
  await saveExportFolderHandle(handle);
  cachedHandle = handle;
  return { supported: true, chosen: true, label: handle.name };
}

/** Goes back to Downloads, or to the browser's downloads. */
export async function resetExportFolder(): Promise<ExportFolderInfo> {
  if (isDesktopApp()) return fromDesktop(await invoke<DesktopFolder>("export_reset_folder"));
  await saveExportFolderHandle(null);
  cachedHandle = null;
  return { supported: canPickBrowserFolder(), chosen: false, label: null };
}

/**
 * Where the next export goes. Start it as the export starts, before any slow
 * work: a browser can only ask again for permission to write to the chosen
 * folder while the click that began the export still counts.
 */
export function prepareExport(): Promise<ExportTarget> {
  if (isDesktopApp()) return Promise.resolve({ kind: "desktop" });
  return (async (): Promise<ExportTarget> => {
    const handle = canPickBrowserFolder() ? await browserFolder() : null;
    if (!handle) return { kind: "browser", fellBack: false };
    const permissioned = handle as PermissionedHandle;
    const mode = { mode: "readwrite" } as const;
    try {
      let state = (await permissioned.queryPermission?.(mode)) ?? "granted";
      if (state === "prompt") {
        state = (await permissioned.requestPermission?.(mode)) ?? "denied";
      }
      if (state === "granted") return { kind: "folder", handle };
    } catch {
      // No click left to ask with, or the folder is gone.
    }
    return { kind: "browser", fellBack: true };
  })();
}

/**
 * Saves an export where the user asked and tells everyone listening where it
 * went. Pass the target from prepareExport when the export took a while to
 * build; without one it is worked out here.
 */
export async function saveExport(
  blob: Blob,
  fileName: string,
  target?: ExportTarget | Promise<ExportTarget>,
): Promise<ExportSaved> {
  const saved = await write(blob, fileName, await (target ?? prepareExport()));
  for (const listener of listeners) listener(saved);
  return saved;
}

/** Desktop only: opens the folder with the exported file selected. */
export async function revealExport(path: string): Promise<void> {
  await invoke<void>("export_reveal", { path });
}

async function write(
  blob: Blob,
  fileName: string,
  target: ExportTarget,
): Promise<ExportSaved> {
  if (target.kind === "desktop") {
    const written = await invoke<DesktopWritten>(
      "export_write",
      new Uint8Array(await blob.arrayBuffer()),
      { headers: { "x-cascade-name": encodeURIComponent(fileName) } },
    );
    return {
      fileName: written.path.split(/[\\/]/).pop() || fileName,
      location: { kind: "path", folder: written.folder, path: written.path },
      fellBack: written.fellBack,
    };
  }
  if (target.kind === "folder") {
    try {
      const name = await writeToFolder(target.handle, fileName, blob);
      return {
        fileName: name,
        location: { kind: "folder", folder: target.handle.name },
        fellBack: false,
      };
    } catch {
      browserDownload(blob, fileName);
      return { fileName, location: { kind: "browser" }, fellBack: true };
    }
  }
  browserDownload(blob, fileName);
  return { fileName, location: { kind: "browser" }, fellBack: target.fellBack };
}

/** `name`, or the first "name (n)" not already in the folder. */
export async function freeName(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 0; n < 1000; n++) {
    const candidate = n === 0 ? name : `${stem} (${n})${ext}`;
    try {
      await dir.getFileHandle(candidate);
    } catch (error) {
      const reason = (error as DOMException | null)?.name;
      if (reason === "NotFoundError") return candidate;
      // A folder by that name counts as taken; anything else is a real error.
      if (reason !== "TypeMismatchError") throw error;
    }
  }
  return `${stem} (${Date.now()})${ext}`;
}

async function writeToFolder(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<string> {
  const name = await freeName(dir, fileName);
  const file = await dir.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  try {
    await stream.write(blob);
  } finally {
    await stream.close();
  }
  return name;
}

function browserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Forgets the folder held in memory, for tests. */
export function resetExportDestinationForTests(): void {
  cachedHandle = undefined;
  listeners.clear();
}
