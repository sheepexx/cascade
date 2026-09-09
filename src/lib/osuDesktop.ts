import { isDesktopApp } from "./pwa";

export type OsuStatus = {
  supported: boolean;
  installed: boolean;
  running: boolean;
  chosen: boolean;
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

/**
 * What the native watcher can currently see. `running` without `connected`
 * means osu! is open but unreadable, which the UI phrases differently from osu!
 * being closed.
 */
export type OsuLive = {
  running: boolean;
  connected: boolean;
  map: OsuSelectedMap | null;
  problem: string | null;
};

export const OSU_LIVE_EVENT = "cascade://osu-live";

export const OSU_OFFLINE: OsuLive = {
  running: false,
  connected: false,
  map: null,
  problem: null,
};

const OFFLINE: OsuStatus = {
  supported: false,
  installed: false,
  running: false,
  chosen: false,
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

export async function osuLive(): Promise<OsuLive> {
  if (!isDesktopApp()) return OSU_OFFLINE;
  try {
    const invoke = await invoker();
    return await invoke<OsuLive>("osu_live");
  } catch {
    return OSU_OFFLINE;
  }
}

/**
 * Subscribes to osu! connection changes. The native side only emits when
 * something actually changed, so this stays quiet while osu! sits still.
 * Delivers the current snapshot immediately so callers need not also poll.
 */
export async function watchOsuLive(
  onLive: (live: OsuLive) => void,
): Promise<() => void> {
  if (!isDesktopApp()) return () => {};

  let stopped = false;
  void osuLive().then((live) => {
    if (!stopped) onLive(live);
  });

  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<OsuLive>(OSU_LIVE_EVENT, (event) => {
    if (!stopped) onLive(event.payload);
  });

  return () => {
    stopped = true;
    unlisten();
  };
}

export async function osuChooseRoot(): Promise<OsuStatus> {
  if (!isDesktopApp()) throw new Error(NOT_DESKTOP);
  const invoke = await invoker();
  return await invoke<OsuStatus>("osu_choose_root");
}

export async function osuForgetRoot(): Promise<OsuStatus> {
  if (!isDesktopApp()) throw new Error(NOT_DESKTOP);
  const invoke = await invoker();
  return await invoke<OsuStatus>("osu_forget_root");
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

/**
 * The background image of a map in the osu! Songs folder, or null when the map
 * has none. Failures are a missing picture rather than something worth
 * reporting, so they come back as null too.
 */
export async function osuMapBackground(
  folder: string,
  file: string,
): Promise<Blob | null> {
  if (!isDesktopApp()) return null;
  try {
    const invoke = await invoker();
    const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(
      "osu_map_background",
      { folder, file },
    );
    const buffer = toBuffer(bytes);
    if (buffer.byteLength === 0) return null;
    const type = imageMime(new Uint8Array(buffer));
    return type ? new Blob([buffer], { type }) : null;
  } catch {
    return null;
  }
}

/**
 * Sniffed from the leading bytes: the bridge hands back a bare buffer, and a
 * blob URL only renders when its type is right.
 */
function imageMime(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0x42, 0x4d)) return "image/bmp";
  return null;
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

export async function osuSyncMap(
  archive: Blob,
  folder: string,
): Promise<string> {
  if (!isDesktopApp()) throw new Error(NOT_DESKTOP);
  const invoke = await invoker();
  const bytes = new Uint8Array(await archive.arrayBuffer());
  return await invoke<string>("osu_sync_map", bytes, {
    headers: { "x-cascade-name": encodeURIComponent(folder) },
  });
}

export async function osuListSkins(): Promise<string[]> {
  if (!isDesktopApp()) return [];
  const invoke = await invoker();
  return await invoke<string[]>("osu_list_skins");
}

export async function osuReadSkin(name: string): Promise<File> {
  if (!isDesktopApp()) throw new Error(NOT_DESKTOP);
  const invoke = await invoker();
  const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(
    "osu_read_skin",
    { name },
  );
  return new File([toBuffer(bytes)], `${name}.osk`, {
    type: "application/x-osu-skin",
  });
}

export function osuFolderName(artist: string, title: string): string {
  const name = [artist, title].map((part) => part.trim()).filter(Boolean);
  return name.length ? name.join(" - ") : "Cascade map";
}

/**
 * The artist and title to show for a map.
 *
 * osu! occasionally hands back a selection before its song strings are
 * populated, leaving only the Songs folder to go on. Those are named
 * `<set id> <artist> - <title>`, so the folder is read that way rather than
 * printed raw — otherwise the banner leads with a beatmap id.
 */
export function osuMapName(map: OsuSelectedMap): {
  artist: string;
  title: string;
} {
  if (map.artist && map.title) return { artist: map.artist, title: map.title };

  // A downloaded folder is prefixed with the beatmap set id, and osu! always
  // follows that with the artist — so digits running straight into the
  // separator are an artist called something numeric, not an id.
  const folder = map.folder.trim().replace(/^\d+\s+(?!- )/, "");
  const split = folder.indexOf(" - ");
  if (split < 0) {
    return { artist: map.artist, title: map.title || folder };
  }
  return {
    artist: map.artist || folder.slice(0, split).trim(),
    title: map.title || folder.slice(split + 3).trim(),
  };
}

export function osuMapLabel(map: OsuSelectedMap): string {
  const { artist, title } = osuMapName(map);
  const song = [artist, title].filter(Boolean).join(" - ");
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
