import { useEffect, useState } from "react";
import { osuMapBackground, type OsuSelectedMap } from "../lib/osuDesktop";

/**
 * Backgrounds are megabytes each and the banner can be on screen in two places
 * at once, so they are read once per map and kept. A handful covers the maps
 * anyone passes through in a session; older ones are released.
 */
const CACHE_LIMIT = 8;

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

const keyFor = (map: OsuSelectedMap) => `${map.folder}\n${map.file}`;

function remember(key: string, url: string | null): void {
  cache.set(key, url);
  for (const [old, value] of cache) {
    if (cache.size <= CACHE_LIMIT) break;
    if (old === key) continue;
    cache.delete(old);
    if (value) URL.revokeObjectURL(value);
  }
}

function load(key: string, map: OsuSelectedMap): Promise<string | null> {
  const running = inFlight.get(key);
  if (running) return running;

  const request = osuMapBackground(map.folder, map.file)
    .then((blob) => {
      const url = blob ? URL.createObjectURL(blob) : null;
      remember(key, url);
      return url;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

/**
 * The background of the map osu! is sitting on, as an object URL. Null while it
 * is being read and for maps that ship without one, which the banner draws its
 * own artwork for.
 */
export function useOsuMapBackground(map: OsuSelectedMap | null): string | null {
  const key = map ? keyFor(map) : null;
  const [url, setUrl] = useState<string | null>(() =>
    key ? (cache.get(key) ?? null) : null,
  );

  useEffect(() => {
    if (!map || !key) {
      setUrl(null);
      return;
    }
    if (cache.has(key)) {
      setUrl(cache.get(key) ?? null);
      return;
    }

    // The outgoing artwork is deliberately left in place while the next one is
    // read, so switching songs cross-fades instead of blinking through to bare
    // panel for the length of a disk read.
    let live = true;
    void load(key, map).then((found) => {
      if (live) setUrl(found);
    });
    return () => {
      live = false;
    };
    // The map object is replaced on every watcher tick, so the key it reduces
    // to is what actually decides whether a new read is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return url;
}
