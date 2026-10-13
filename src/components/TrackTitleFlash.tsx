import { useEffect, useRef, useState } from "react";
import type { MenuTrack } from "../hooks/useMenuMusic";
import { displayArtist, displayTitle } from "../lib/metadataDisplay";

type TitledTrack = Pick<MenuTrack, "id" | "title" | "artist" | "titleUnicode" | "artistUnicode">;

/**
 * The menu song's title and artist in the top-right corner for a few seconds
 * each time a new one starts, the first one included, then fading away, the
 * way osu! announces a song. It waits for the track to actually play, so a
 * browser holding back autoplay doesn't spend it before anything is heard,
 * and for whatever covers the menu (the intro) to lift. Pausing and resuming
 * the same song doesn't bring it back.
 */
export function TrackTitleFlash({
  track,
  playing,
  preferOriginalMetadata,
  held,
}: {
  track: TitledTrack | null;
  playing: boolean;
  preferOriginalMetadata: boolean;
  held: boolean;
}) {
  const [shown, setShown] = useState<{ id: string; title: string; artist: string } | null>(null);
  const lastShown = useRef<string | null>(null);

  useEffect(() => {
    if (held || !track || !playing || track.id === lastShown.current) return;
    lastShown.current = track.id;
    setShown({
      id: track.id,
      title: displayTitle(track, preferOriginalMetadata),
      artist: displayArtist(track, preferOriginalMetadata),
    });
  }, [track, playing, held, preferOriginalMetadata]);

  if (!shown || !shown.title) return null;
  return (
    <div
      key={shown.id}
      aria-hidden
      data-testid="track-title-flash"
      onAnimationEnd={() => setShown(null)}
      className="track-title-flash menu-legible pointer-events-none absolute right-6 top-[4.75rem] z-10 max-w-[min(36rem,70vw)] text-right text-white"
    >
      <p className="truncate text-3xl font-light leading-tight tracking-tight">{shown.title}</p>
      {shown.artist && <p className="mt-0.5 truncate text-lg font-light text-slate-100">{shown.artist}</p>}
    </div>
  );
}
