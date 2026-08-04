import { useEffect, useRef, type ReactNode } from "react";
import type { MenuMusic } from "../hooks/useMenuMusic";

export function NowPlaying({ music }: { music: MenuMusic }) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const musicRef = useRef(music);
  musicRef.current = music;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const fill = fillRef.current;
      if (!fill) return;
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
        <MiniButton label={isPlaying ? "Pause" : "Play"} onClick={toggle}>
          {isPlaying ? "❚❚" : "▶"}
        </MiniButton>
        <MiniButton label="Next track" onClick={next}>
          ▶❘
        </MiniButton>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
        <div
          ref={fillRef}
          className="h-full w-full origin-left scale-x-0 bg-accent/85"
        />
      </div>
    </div>
  );
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
