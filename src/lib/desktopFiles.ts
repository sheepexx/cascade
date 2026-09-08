import { isDesktopApp } from "./pwa";

export const OPEN_EVENT = "cascade://open-files";

const MIME: Record<string, string> = {
  osz: "application/x-osu-archive",
  osu: "application/x-osu-beatmap",
  sm: "application/x-stepmania",
  ssc: "application/x-stepmania",
  qua: "application/x-quaver",
  osk: "application/x-osu-skin",
};

export function baseName(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  return name || path;
}

export function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

async function readLaunchFile(path: string): Promise<File> {
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = await invoke<ArrayBuffer>("read_launch_file", { path });
  const name = baseName(path);
  return new File([bytes], name, { type: mimeFor(name) });
}

async function drain(): Promise<File[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  const paths = await invoke<string[]>("take_launch_files");
  const files: File[] = [];
  for (const path of paths) {
    try {
      files.push(await readLaunchFile(path));
    } catch {
      continue;
    }
  }
  return files;
}

export async function watchLaunchFiles(
  onFiles: (files: File[]) => void,
): Promise<() => void> {
  if (!isDesktopApp()) return () => {};

  const deliver = () => {
    void drain().then((files) => {
      if (files.length) onFiles(files);
    });
  };

  deliver();

  const { listen } = await import("@tauri-apps/api/event");
  return await listen(OPEN_EVENT, deliver);
}
