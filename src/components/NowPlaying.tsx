import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MenuMusic } from "../hooks/useMenuMusic";
import { useT } from "../lib/i18n";

export function NowPlaying({ music }: { music: MenuMusic }) {
  const t = useT();
  const fillRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const [scrubbing, setScrubbing] = useState(false);
  const scrubbingRef = useRef(false);
  scrubbingRef.current = scrubbing;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const fill = fillRef.current;
      if (!fill || scrubbingRef.current) return;
      const playback = musicRef.current.getPlayback();
      const ratio =
        playback && playback.duration > 0
          ? Math.min(1, playback.position / playback.duration)
          : 0;
      fill.style.transform = `scaleX(${ratio.toFixed(4)})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scrubTo = useCallback((clientX: number) => {
    const bar = barRef.current;
    const playback = musicRef.current.getPlayback();
    if (!bar || !playback || playback.duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const fill = fillRef.current;
    if (fill) fill.style.transform = `scaleX(${ratio.toFixed(4)})`;
    musicRef.current.seek(ratio * playback.duration);
  }, []);

  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: PointerEvent) => scrubTo(e.clientX);
    const stop = () => setScrubbing(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [scrubbing, scrubTo]);

  const { track, isPlaying, toggle, next } = music;
  if (!track) return null;

  return (
    <div className="relative hidden min-w-0 max-w-[200px] overflow-hidden rounded-full border border-white/10 bg-ink-700/42 py-1 pl-3 pr-1 shadow-sm backdrop-blur-xl md:block lg:max-w-[280px]">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`shrink-0 text-[11px] text-accent-soft ${
            isPlaying ? "animate-pulse" : "opacity-50"
          }`}
          aria-hidden
        >
          ♪
        </span>
        <span
          key={track.id}
          className="track-fade-in min-w-0 flex-1 truncate text-[11px] leading-none"
        >
          {track.artist && (
            <span className="text-slate-500">{track.artist} · </span>
          )}
          <span className="font-medium text-slate-200">{track.title}</span>
        </span>
        <MiniButton label={isPlaying ? t("nowPlaying.pause") : t("nowPlaying.play")} onClick={toggle}>
          {isPlaying ? "❚❚" : "▶"}
        </MiniButton>
        <MiniButton label={t("nowPlaying.next")} onClick={next}>
          ▶❘
        </MiniButton>
      </div>
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label={t("nowPlaying.seek")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(seekRatio(music) * 100)}
        onPointerDown={(e) => {
          e.preventDefault();
          setScrubbing(true);
          scrubTo(e.clientX);
        }}
        onKeyDown={(e) => {
          const step =
            e.key === "ArrowLeft" ? -5000 : e.key === "ArrowRight" ? 5000 : 0;
          if (!step) return;
          e.preventDefault();
          e.stopPropagation();
          const playback = music.getPlayback();
          if (playback) music.seek(playback.position + step);
        }}
        className={`absolute inset-x-0 bottom-0 flex cursor-pointer touch-none items-end pt-2 outline-none ${
          scrubbing ? "" : "group"
        }`}
      >
        <div
          className={`w-full bg-white/10 transition-[height] duration-150 ${
            scrubbing ? "h-[5px]" : "h-[2px] group-hover:h-[5px]"
          }`}
        >
          <div
            ref={fillRef}
            className="h-full w-full origin-left scale-x-0 bg-accent/85"
          />
        </div>
      </div>
    </div>
  );
}

function seekRatio(music: MenuMusic): number {
  const playback = music.getPlayback();
  if (!playback || playback.duration <= 0) return 0;
  return Math.max(0, Math.min(1, playback.position / playback.duration));
}

function MiniButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
