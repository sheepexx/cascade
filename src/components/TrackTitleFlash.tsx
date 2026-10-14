import { useEffect, useRef, useState } from "react";
import type { MenuTrack } from "../hooks/useMenuMusic";
import { displayArtist, displayTitle } from "../lib/metadataDisplay";

type TitledTrack = Pick<MenuTrack, "id" | "title" | "artist" | "titleUnicode" | "artistUnicode">;

type Shown = { key: number; title: string; artist: string; leaving: boolean };

/**
 * The menu song's title and artist in the top-right corner for a few seconds,
 * then fading away, the way osu! announces a song: when the menu opens, and
 * when someone skips to another song while it is open. Songs that follow on
 * by themselves aren't announced, and collapsing the menu fades it out at
 * once. It waits for the song to actually play, so a browser holding back
 * autoplay doesn't spend it before anything is heard, and for whatever covers
 * the menu (the intro) to lift.
 */
export function TrackTitleFlash({
  track,
  playing,
  open,
  skips,
  preferOriginalMetadata,
  held,
}: {
  track: TitledTrack | null;
  playing: boolean;
  /** The menu is open (the logo was clicked). */
  open: boolean;
  /** MenuMusic.skips. */
  skips: number;
  preferOriginalMetadata: boolean;
  held: boolean;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  /** An announcement waiting for a song to play: any song, or one other than `from`. */
  const pending = useRef<{ from: string | null } | null>(null);
  const wasOpen = useRef(false);
  const lastSkips = useRef(skips);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      pending.current = null;
      lastSkips.current = skips;
      setShown((s) => (s && !s.leaving ? { ...s, leaving: true } : s));
      return;
    }
    if (!wasOpen.current) {
      wasOpen.current = true;
      pending.current = { from: null };
    }
    if (skips !== lastSkips.current) {
      lastSkips.current = skips;
      // The skip lands before the next song has loaded, so this is the old one.
      pending.current = { from: track?.id ?? null };
    }
    const want = pending.current;
    if (!want || held || !track || !playing || track.id === want.from) return;
    pending.current = null;
    seq.current += 1;
    setShown({
      key: seq.current,
      title: displayTitle(track, preferOriginalMetadata),
      artist: displayArtist(track, preferOriginalMetadata),
      leaving: false,
    });
  }, [open, skips, track, playing, held, preferOriginalMetadata]);

  if (!shown || !shown.title) return null;
  return (
    <div
      key={shown.key}
      aria-hidden
      data-testid="track-title-flash"
      data-leaving={shown.leaving ? "" : undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setShown(null);
      }}
      className="track-title-flash menu-legible font-display pointer-events-none absolute right-6 top-[4.75rem] z-10 max-w-[min(26rem,60vw)] text-right text-white"
    >
      <p className="truncate text-lg font-light leading-tight">{shown.title}</p>
      {shown.artist && <p className="truncate text-xs font-light text-slate-200">{shown.artist}</p>}
    </div>
  );
}
