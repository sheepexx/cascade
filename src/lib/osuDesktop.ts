import { isDesktopApp } from "./pwa";

export type OsuStatus = {
  supported: boolean;
  installed: boolean;
  running: boolean;
  root: string | null;
  songs: string | null;
};

export type OsuSelectedMap = {
  folder: string;
  file: string;
  artist: string;
  title: string;
  creator: string;
  difficulty: string;
  mapId: number;
  setId: number;
  osuRoot: string | null;
};

const OFFLINE: OsuStatus = {
  supported: false,
  installed: false,
  running: false,
  root: null,
  songs: null,
};

export const NOT_DESKTOP = "The osu! integration only works in the Cascade app.";

async function invoker() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export async function osuStatus(): Promise<OsuStatus> {
  if (!isDesktopApp()) return OFFLINE;
  try {
    const invoke = await invoker();
    return await invoke<OsuStatus>("osu_status");
  } catch {
    return OFFLINE;
  }
}

export async function osuSelectedMap(): Promise<OsuSelectedMap> {
  if (!isDesktopApp()) throw new Error(NOT_DESKTOP);
  const invoke = await invoker();
  return await invoke<OsuSelectedMap>("osu_selected_map");
}

export async function osuReadMap(folder: string): Promise<Blob> {
  if (!isDesktopApp()) throw new Error(NOT_DESKTOP);
  const invoke = await invoker();
  const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(
    "osu_read_map",
    { folder },
  );
  return new Blob([toBuffer(bytes)], { type: "application/x-osu-archive" });
}

export async function osuSendMap(
  archive: Blob,
  fileName: string,
): Promise<string> {
  if (!isDesktopApp()) throw new Error(NOT_DESKTOP);
  const invoke = await invoker();
  const bytes = new Uint8Array(await archive.arrayBuffer());
  return await invoke<string>("osu_send_map", bytes, {
    headers: { "x-cascade-name": encodeURIComponent(fileName) },
  });
}

export function osuMapLabel(map: OsuSelectedMap): string {
  const song = [map.artist, map.title].filter(Boolean).join(" - ");
  const name = song || map.folder;
  return map.difficulty ? `${name} [${map.difficulty}]` : name;
}

function toBuffer(value: ArrayBuffer | Uint8Array | number[]): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  const source = Array.isArray(value) ? new Uint8Array(value) : value;
  const copy = new ArrayBuffer(source.byteLength);
  new Uint8Array(copy).set(source);
  return copy;
}
