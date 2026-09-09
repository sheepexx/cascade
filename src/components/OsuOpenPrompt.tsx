import { useEffect, useState, type CSSProperties } from "react";
import { useT } from "../lib/i18n";
import { useOsuMapBackground } from "../hooks/useOsuMapBackground";
import {
  osuMapLabel,
  osuMapName,
  type OsuSelectedMap,
} from "../lib/osuDesktop";

type Props = {
  map: OsuSelectedMap;
  busy?: boolean;
  onOpen: () => void;
  className?: string;
  /**
   * `slab` cuts the whole banner at the menu's angle, for the start screen where
   * it sits on the bottom edge as another piece of the menu. `plain` keeps the
   * edges square, for the dialogs where a slanted block would fight the panel it
   * sits in.
   */
  variant?: "slab" | "plain";
};

/** Matches the skew the start menu cuts its panels at. */
const SKEW = "-11deg";

/**
 * Offers the map osu! currently sits on. Shown wherever the user is about to
 * pick a map from somewhere else — the start menu, and the new-map and import
 * dialogs — so the map already in front of them in song select is one click
 * away. Rendered only while the watcher can actually see a map, so it never
 * appears as a dead entry.
 *
 * Dressed in the map's own background, the way song select shows it, so the
 * offer is recognisably *that* map rather than a line of text about it. Only the
 * backdrop is cut at an angle; the song details stay upright.
 */
export function OsuOpenPrompt({
  map,
  busy = false,
  onOpen,
  className,
  variant = "plain",
}: Props) {
  const t = useT();
  const art = useOsuMapBackground(map);
  const { artist, title } = osuMapName(map);
  const slab = variant === "slab";
  // Remounts the text on every song change, so it rises into place rather than
  // snapping from one map's details to the next.
  const song = `${map.folder}\n${map.file}`;

  return (
    <div
      /* The start screen slides the whole slab in, so only the dialogs need
         an entrance of their own. */
      className={`osu-song-card relative isolate text-left ${
        slab ? "h-[var(--menu-bar-height,136px)]" : "osu-banner-in"
      } ${className ?? ""}`}
    >
      <div
        aria-hidden
        className="osu-song-surface absolute inset-0 -z-10 overflow-hidden border border-white/20"
        /* The skew rides on the backdrop alone. Clipping happens before the
           transform, so the artwork fills the slanted shape exactly. */
        style={slab ? { transform: `skewX(${SKEW})` } : undefined}
      >
        <Artwork
          art={art}
          /* Scaled past the edges so the blur has pixels to smear instead of
             fading into the corners. */
          className="scale-125 blur-[8px] saturate-125"
        />
        <div className="osu-song-scrim absolute inset-0" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-white/5 via-white/40 to-white/5" />
        <div className="absolute inset-y-0 left-0 w-[2px] bg-accent/80" />
      </div>

      {/* Slanted edges eat into the corners, so the slab needs the room back. */}
      <div
        className={`relative flex h-full items-center gap-4 ${
          slab ? "px-7 py-3" : "px-4 py-3"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div key={song} className="osu-banner-swap min-w-0">
            <p
              title={title}
              className={`truncate font-bold tracking-tight text-white drop-shadow-sm ${
                slab ? "text-[20px] leading-6" : "text-sm leading-5"
              }`}
            >
              {title}
            </p>
            {artist && (
              <p
                title={artist}
                className={`truncate font-medium leading-4 text-white/75 ${slab ? "text-[12px]" : "text-xs"}`}
              >
                {artist}
              </p>
            )}
            {(map.difficulty || map.creator) && (
              <p className={`flex min-w-0 items-center gap-2 text-[10px] leading-4 text-white/65 ${slab ? "mt-2" : "mt-1.5"}`}>
                {map.difficulty && (
                  <span
                    title={map.difficulty}
                    className="max-w-[55%] truncate rounded-sm border border-white/15 bg-white/10 px-1.5 font-semibold text-white/90"
                  >
                    {map.difficulty}
                  </span>
                )}
                {map.creator && (
                  <span
                    title={t("osu.mappedBy", { name: map.creator })}
                    className="min-w-0 truncate"
                  >
                    {t("osu.mappedBy", { name: map.creator })}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          disabled={busy}
          aria-busy={busy}
          aria-label={t("osu.openSelected", { name: osuMapLabel(map) })}
          className="osu-song-open group relative flex h-11 shrink-0 items-center justify-center px-4 text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
          style={{ "--osu-action-skew": slab ? SKEW : "0deg" } as CSSProperties}
        >
          <span
            aria-hidden
            className="osu-song-open-face absolute inset-0 border border-white/25 bg-white/10"
          />
          <span className={`relative flex items-center gap-2 font-bold ${slab ? "text-[12px]" : "text-xs"}`}>
            {busy ? t("osu.opening") : t("common.open")}
            {busy ? (
              <span
                aria-hidden
                className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white motion-reduce:animate-none"
              />
            ) : (
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
              >
                <path
                  d="M4 10h12m-5-5 5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * Beatmap artwork that fades over whatever it replaces. Switching songs keeps
 * the outgoing image underneath until the incoming one has arrived, so the card
 * never blinks through to bare panel between two maps. Fills its container, so
 * every caller has to give it a sized one.
 */
function Artwork({
  art,
  className = "",
}: {
  art: string | null;
  className?: string;
}) {
  const [layers, setLayers] = useState<string[]>(() => (art ? [art] : []));

  useEffect(() => {
    if (!art) {
      setLayers([]);
      return;
    }
    setLayers((current) =>
      current[current.length - 1] === art
        ? current
        : [...current, art].slice(-2),
    );
  }, [art]);

  if (!layers.length) return null;

  return (
    <>
      {layers.map((url, index) => (
        <img
          key={url}
          src={url}
          alt=""
          // Only the newest layer fades; the one below it is the outgoing image
          // holding the space until the fade has covered it.
          className={`absolute inset-0 h-full w-full object-cover ${
            index === layers.length - 1 ? "osu-art-in" : ""
          } ${className}`}
          onAnimationEnd={() =>
            setLayers((current) => (current.length > 1 ? [url] : current))
          }
        />
      ))}
    </>
  );
}
