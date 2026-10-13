import { useEffect, useRef, useState } from "react";
import type { MenuTrack } from "../hooks/useMenuMusic";
import { displayArtist, displayTitle } from "../lib/metadataDisplay";

type TitledTrack = Pick<MenuTrack, "id" | "title" | "artist" | "titleUnicode" | "artistUnicode">;

/**
 * The menu song's title and artist in the top-right corner for a few seconds
 * when the menu opens (Cascade starting, or coming back from a map), then
 * fading away, the way osu! announces a song. Later songs aren't announced.
 * It waits for the track to actually play, so a browser holding back autoplay
 * doesn't spend it before anything is heard, and for whatever covers the
 * menu (the intro) to lift.
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
  const announced = useRef(false);

  useEffect(() => {
    if (held || !track || !playing || announced.current) return;
    announced.current = true;
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
      className="track-title-flash menu-legible pointer-events-none absolute right-6 top-[4.75rem] z-10 max-w-[min(26rem,60vw)] text-right text-white"
    >
      <p className="truncate text-lg font-light leading-tight">{shown.title}</p>
      {shown.artist && <p className="truncate text-xs font-light text-slate-200">{shown.artist}</p>}
    </div>
  );
}
