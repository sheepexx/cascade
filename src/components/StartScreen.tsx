import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMenuMusic } from "../hooks/useMenuMusic";
import {
  ImportIcon,
  LibraryIcon,
  NewMapIcon,
  PackCreatorIcon,
  SampleMapsIcon,
} from "./ui/StartIcons";

type MenuAction = {
  id: string;
  label: string;
  icon: ReactNode;
  tint: string;
  onClick: () => void;
};

const LOGO_MAX = 300;
const LOGO_MIN = 170;
const RING_RATIO = 0.21;
const BARS = 72;

export function StartScreen({
  onMyMaps,
  onNewMap,
  onPackCreator,
  onTryMaps,
  onImport,
  children,
}: {
  onMyMaps: () => void;
  onNewMap: () => void;
  onPackCreator: () => void;
  onTryMaps: () => void;
  onImport: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [logoSize, setLogoSize] = useState(LOGO_MAX);
  const music = useMenuMusic(true);
  const logoRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const update = () =>
      setLogoSize(
        Math.max(
          LOGO_MIN,
          Math.min(
            LOGO_MAX,
            Math.round(Math.min(window.innerWidth * 0.62, window.innerHeight * 0.42)),
          ),
        ),
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const right: MenuAction[] = [
    {
      id: "myMaps",
      label: "My Maps",
      icon: <LibraryIcon className="h-6 w-6" />,
      tint: "text-sky-300 group-hover:bg-sky-400/20",
      onClick: onMyMaps,
    },
    {
      id: "new",
      label: "New map",
      icon: <NewMapIcon className="h-6 w-6" />,
      tint: "text-accent-soft group-hover:bg-accent/25",
      onClick: onNewMap,
    },
    {
      id: "pack",
      label: "Pack creator",
      icon: <PackCreatorIcon className="h-6 w-6" />,
      tint: "text-amber-300 group-hover:bg-amber-400/20",
      onClick: onPackCreator,
    },
    {
      id: "try",
      label: "Try these maps",
      icon: <SampleMapsIcon className="h-6 w-6" />,
      tint: "text-emerald-300 group-hover:bg-emerald-400/20",
      onClick: onTryMaps,
    },
  ];

  const left: MenuAction[] = [
    {
      id: "import",
      label: "Import map",
      icon: <ImportIcon className="h-6 w-6" />,
      tint: "text-violet-300 group-hover:bg-violet-400/20",
      onClick: onImport,
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative grid min-h-full place-items-center overflow-hidden">
        <MenuBackground url={music.track?.backgroundUrl ?? null} />

        <div className="relative flex w-full items-center justify-center px-6 py-16">
          <div className="relative flex flex-col items-center gap-10 lg:block">
            <MenuStrip
              actions={left}
              open={open}
              className="lg:absolute lg:right-full lg:top-1/2 lg:mr-12 lg:-translate-y-1/2"
              from="lg:translate-x-10"
            />

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Cascade menu"
              aria-expanded={open}
              className="group relative grid place-items-center rounded-full outline-none"
              style={{ width: logoSize, height: logoSize }}
            >
              <Visualizer
                read={music.readLevels}
                logoRef={logoRef}
                active={music.isPlaying}
                size={logoSize}
              />
              <img
                ref={logoRef}
                src={`${import.meta.env.BASE_URL}logo.png?v=2`}
                alt="Cascade"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="relative select-none rounded-full shadow-[0_20px_80px_rgba(232,104,104,0.28)] ring-1 ring-white/10 transition-[filter] duration-300 group-hover:brightness-110"
                style={{ width: logoSize, height: logoSize }}
              />
            </button>

            <MenuStrip
              actions={right}
              open={open}
              className="lg:absolute lg:left-full lg:top-1/2 lg:ml-12 lg:-translate-y-1/2"
              from="lg:-translate-x-10"
            />
          </div>
        </div>

        {music.track && (
          <NowPlaying
            title={music.track.title}
            artist={music.track.artist}
            isPlaying={music.isPlaying}
            onToggle={music.toggle}
            onNext={music.next}
          />
        )}

        <p className="pointer-events-none absolute bottom-3 right-4 text-[11px] font-medium tracking-wide text-slate-600">
          Cascade · v{__APP_VERSION__}
        </p>
      </div>

      {children}
    </div>
  );
}

function MenuStrip({
  actions,
  open,
  className,
  from,
}: {
  actions: MenuAction[];
  open: boolean;
  className: string;
  from: string;
}) {
  return (
    <div
      className={`flex max-w-[92vw] flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/10 bg-ink-900/70 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-md transition-all duration-300 ease-out lg:max-w-none lg:flex-nowrap lg:gap-2 ${className} ${
        open
          ? "translate-x-0 translate-y-0 scale-100 opacity-100"
          : `pointer-events-none translate-y-3 scale-95 opacity-0 ${from}`
      }`}
      aria-hidden={!open}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={a.onClick}
          className="group flex w-[104px] flex-col items-center gap-2 rounded-xl px-2 py-3 text-center transition hover:bg-white/5"
        >
          <span
            className={`grid h-12 w-12 place-items-center rounded-xl bg-white/5 transition ${a.tint}`}
          >
            {a.icon}
          </span>
          <span className="text-[11px] font-semibold leading-tight text-slate-300 transition group-hover:text-white">
            {a.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function MenuBackground({ url }: { url: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!url) {
      setShown(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setShown(url);
      setLoaded(true);
    };
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [url]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {shown && (
        <img
          src={shown}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full scale-105 object-cover blur-[3px] transition-opacity duration-1000 ${
            loaded ? "opacity-[0.18]" : "opacity-0"
          }`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900/85 via-ink-900/70 to-ink-900/95" />
    </div>
  );
}

function Visualizer({
  read,
  logoRef,
  active,
  size: logoSize,
}: {
  read: () => Uint8Array | null;
  logoRef: React.RefObject<HTMLImageElement | null>;
  active: boolean;
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothRef = useRef<number[]>(new Array(BARS).fill(0));
  const ringPad = Math.round(logoSize * RING_RATIO);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const size = logoSize + ringPad * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const radius = logoSize / 2 + 8;
    const maxLen = ringPad - Math.round(logoSize * 0.047);
    const logo = logoRef.current;
    let raf = 0;

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, size, size);

      const levels = read();
      const smooth = smoothRef.current;
      const half = BARS / 2;
      let bass = 0;

      for (let i = 0; i < BARS; i++) {
        const mirrored = i < half ? i : BARS - 1 - i;
        const frac = mirrored / (half - 1);
        let raw: number;
        if (levels) {
          const bin = 1 + Math.round(Math.pow(frac, 1.7) * 40);
          const gain = 0.85 + frac * 2.4;
          raw = Math.min(1, (levels[Math.min(bin, levels.length - 1)] / 255) * gain);
          raw = raw * raw * 1.2;
        } else {
          raw = 0.12 + Math.sin(time / 900 + frac * 3.2) * 0.06;
        }
        smooth[i] += (raw - smooth[i]) * (raw > smooth[i] ? 0.55 : 0.12);
        if (mirrored < 4) bass += smooth[i];
      }

      ctx.lineCap = "round";
      for (let i = 0; i < BARS; i++) {
        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const len = Math.max(2, Math.min(1, smooth[i]) * maxLen);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const cx = size / 2;
        const cy = size / 2;
        ctx.beginPath();
        ctx.moveTo(cx + cos * radius, cy + sin * radius);
        ctx.lineTo(cx + cos * (radius + len), cy + sin * (radius + len));
        ctx.strokeStyle = `rgba(244, 138, 138, ${0.25 + Math.min(1, smooth[i]) * 0.55})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      if (logo) {
        const pulse = 1 + Math.min(0.07, (bass / 8) * 0.12);
        logo.style.transform = `scale(${pulse.toFixed(4)})`;
      }
    };

    if (reduced) {
      ctx.clearRect(0, 0, size, size);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (logo) logo.style.transform = "";
    };
  }, [read, logoRef, logoSize, ringPad]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute transition-opacity duration-700 ${
        active ? "opacity-100" : "opacity-60"
      }`}
      style={{ width: logoSize + ringPad * 2, height: logoSize + ringPad * 2 }}
    />
  );
}

function NowPlaying({
  title,
  artist,
  isPlaying,
  onToggle,
  onNext,
}: {
  title: string;
  artist: string;
  isPlaying: boolean;
  onToggle: () => void;
  onNext: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-ink-900/70 py-2 pl-4 pr-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <span
        className={`text-accent-soft ${isPlaying ? "animate-pulse" : "opacity-50"}`}
        aria-hidden
      >
        ♪
      </span>
      <span className="min-w-0 truncate text-xs text-slate-300">
        {artist && <span className="text-slate-500">{artist} · </span>}
        <span className="font-semibold text-slate-100">{title}</span>
      </span>
      <div className="flex items-center gap-1">
        <MiniButton
          label={isPlaying ? "Pause" : "Play"}
          onClick={onToggle}
        >
          {isPlaying ? "❚❚" : "▶"}
        </MiniButton>
        <MiniButton label="Next track" onClick={onNext}>
          ▶❘
        </MiniButton>
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
      className="grid h-7 w-7 place-items-center rounded-full text-[10px] text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
