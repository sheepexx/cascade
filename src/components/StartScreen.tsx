import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MenuMusic } from "../hooks/useMenuMusic";
import { useAuth } from "../lib/auth";
import { countLocalProjects } from "../lib/persistence";
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
  color: string;
  onClick: () => void;
};

const LOGO_CLOSED = 300;
const LOGO_OPEN = 196;
const LOGO_MIN = 168;
const BAR_HEIGHT = 136;
const PANEL_MAX = 152;
const PANEL_MIN = 104;
const RING_RATIO = 0.42;
const ROUNDS = 3;
const BARS = 32;
const SKEW = "-11deg";

export function StartScreen({
  music,
  onMyMaps,
  onNewMap,
  onPackCreator,
  onTryMaps,
  onImport,
  children,
}: {
  music: MenuMusic;
  onMyMaps: () => void;
  onNewMap: () => void;
  onPackCreator: () => void;
  onTryMaps: () => void;
  onImport: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(() => measure());
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const { user } = useAuth();
  const pulseRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => setLayout(measure());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!open || projectCount !== null) return;
    let cancelled = false;
    countLocalProjects()
      .then((n) => {
        if (!cancelled) setProjectCount(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, projectCount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const left: MenuAction[] = [
    {
      id: "import",
      label: "Import map",
      icon: <ImportIcon className="h-7 w-7" />,
      color: "#3c3c46",
      onClick: onImport,
    },
  ];

  const right: MenuAction[] = [
    {
      id: "myMaps",
      label: "My Maps",
      icon: <LibraryIcon className="h-7 w-7" />,
      color: "#7c4dd8",
      onClick: onMyMaps,
    },
    {
      id: "new",
      label: "New map",
      icon: <NewMapIcon className="h-7 w-7" />,
      color: "#e86868",
      onClick: onNewMap,
    },
    {
      id: "pack",
      label: "Pack creator",
      icon: <PackCreatorIcon className="h-7 w-7" />,
      color: "#e0972f",
      onClick: onPackCreator,
    },
    {
      id: "try",
      label: "Try these maps",
      icon: <SampleMapsIcon className="h-7 w-7" />,
      color: "#7fb03a",
      onClick: onTryMaps,
    },
  ];

  const { wide, panel, logoOpen, logoClosed } = layout;
  const shift = ((left.length - right.length) * panel) / 2;
  const logoSize = open ? logoOpen : logoClosed;

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative grid min-h-full place-items-center overflow-hidden">
        <MenuBackground url={music.track?.backgroundUrl ?? null} />

        {open && (
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
          />
        )}

        <div
          className={`pointer-events-none absolute inset-x-0 flex flex-col items-center px-4 text-center transition-all duration-300 ease-out ${
            open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
          style={{
            bottom: `calc(50% + ${
              (wide ? Math.max(BAR_HEIGHT / 2, logoOpen / 2) : logoClosed / 2) +
              32
            }px)`,
          }}
        >
          <p className="text-lg font-semibold text-slate-100 drop-shadow">
            {greeting()}
            {user ? `, ${user.username}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 drop-shadow">
            {projectCount === null
              ? " "
              : projectCount === 0
                ? "You don't have any local projects yet."
                : `You currently have ${projectCount} local project${
                    projectCount === 1 ? "" : "s"
                  }.`}
          </p>
        </div>

        {wide ? (
          <div
            className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 transition-all duration-300 ease-out ${
              open ? "opacity-100" : "opacity-0"
            }`}
            style={{ height: BAR_HEIGHT }}
          >
            <div
              className={`absolute inset-0 bg-ink-800/90 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-transform duration-300 ease-out ${
                open ? "scale-y-100" : "scale-y-50"
              }`}
            />
            <div
              className={`absolute inset-0 flex justify-center ${
                open ? "pointer-events-auto" : "pointer-events-none"
              }`}
            >
              {left.map((a) => (
                <Panel key={a.id} action={a} width={panel} open={open} />
              ))}
              <div style={{ width: logoOpen }} />
              {right.map((a) => (
                <Panel key={a.id} action={a} width={panel} open={open} />
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`absolute inset-x-0 flex justify-center px-3 transition-all duration-300 ease-out ${
              open
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0"
            }`}
            style={{ top: `calc(50% + ${Math.round(logoClosed / 2) + 22}px)` }}
          >
            <div className="flex max-w-full flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-ink-800/90 p-2 backdrop-blur-md">
              {[...left, ...right].map((a) => (
                <StackedAction key={a.id} action={a} open={open} />
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Cascade menu"
          aria-expanded={open}
          className="group absolute left-1/2 top-1/2 outline-none transition-transform duration-300 ease-out"
          style={{
            width: logoClosed,
            height: logoClosed,
            transform: `translate(-50%, -50%) translateX(${
              open && wide ? shift : 0
            }px) scale(${logoSize / logoClosed})`,
          }}
        >
          <div ref={pulseRef} className="relative h-full w-full">
            <Visualizer
              music={music}
              size={logoClosed}
              pulseRef={pulseRef}
              active={music.isPlaying}
            />
            <img
              src={`${import.meta.env.BASE_URL}logo.png?v=2`}
              alt="Cascade"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="relative h-full w-full select-none rounded-full shadow-[0_20px_80px_rgba(232,104,104,0.3)] ring-1 ring-white/10 transition-[filter] duration-200 group-hover:brightness-110"
            />
          </div>
        </button>

        <p className="pointer-events-none absolute bottom-3 right-4 text-[11px] font-medium tracking-wide text-slate-600">
          Cascade · v{__APP_VERSION__}
        </p>
      </div>

      {children}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  if (hour < 23) return "Good evening";
  return "Good night";
}

function measure() {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const wide = vw >= 900 && vh >= 560;
  const panel = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(vw / 8.6)));
  const logoClosed = Math.max(
    LOGO_MIN,
    Math.min(
      LOGO_CLOSED,
      Math.round(wide ? Math.min(vw * 0.6, vh * 0.44) : Math.min(vw * 0.55, vh * 0.3)),
    ),
  );
  const logoOpen = wide
    ? Math.min(LOGO_OPEN, Math.round(logoClosed * 0.68))
    : logoClosed;
  return { wide, panel, logoOpen, logoClosed };
}

function Panel({
  action,
  width,
  open,
}: {
  action: MenuAction;
  width: number;
  open: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      onClick={action.onClick}
      className="group relative h-full shrink-0 text-white outline-none"
      style={{ width }}
    >
      <span
        aria-hidden
        className="absolute -left-px -right-px inset-y-0 transition-[filter] duration-150 group-hover:brightness-125 group-focus-visible:brightness-125"
        style={{ background: action.color, transform: `skewX(${SKEW})` }}
      />
      <span className="relative flex h-full flex-col items-center justify-center gap-2 transition-transform duration-150 group-hover:scale-105">
        {action.icon}
        <span className="text-[13px] font-semibold tracking-wide drop-shadow">
          {action.label}
        </span>
      </span>
    </button>
  );
}

function StackedAction({
  action,
  open,
}: {
  action: MenuAction;
  open: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      onClick={action.onClick}
      className="group flex w-[104px] flex-col items-center gap-2 rounded-xl px-2 py-3 text-center transition hover:bg-white/5"
    >
      <span
        className="grid h-12 w-12 place-items-center rounded-xl text-white transition group-hover:brightness-125"
        style={{ background: action.color }}
      >
        {action.icon}
      </span>
      <span className="text-[11px] font-semibold leading-tight text-slate-200">
        {action.label}
      </span>
    </button>
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
          className={`absolute inset-0 h-full w-full scale-105 object-cover blur-[2px] transition-opacity duration-1000 ${
            loaded ? "opacity-[0.3]" : "opacity-0"
          }`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900/80 via-ink-900/66 to-ink-900/88" />
    </div>
  );
}

function Visualizer({
  music,
  size,
  pulseRef,
  active,
}: {
  music: MenuMusic;
  size: number;
  pulseRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothRef = useRef<number[]>(new Array(BARS).fill(0));
  const musicRef = useRef(music);
  musicRef.current = music;
  const pad = Math.round(size * RING_RATIO);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const box = size + pad * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = box * dpr;
    canvas.height = box * dpr;
    ctx.scale(dpr, dpr);

    const radius = size / 2 - 2;
    const maxLen = pad * 0.9;
    const centre = box / 2;
    const node = pulseRef.current;
    const step = (Math.PI * 2) / BARS;
    const roundStep = (Math.PI * 2) / ROUNDS;
    let rotation = 0;
    let last = 0;
    let raf = 0;

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const delta = last ? Math.min(64, time - last) : 16;
      last = time;
      rotation += delta * 0.00009;
      ctx.clearRect(0, 0, box, box);

      const { readLevels, getPlayback, track } = musicRef.current;
      const levels = readLevels();
      const amps = smoothRef.current;
      const decay = Math.pow(0.9975, delta);
      let loud = 0;

      for (let i = 0; i < BARS; i++) {
        const frac = i / (BARS - 1);
        let raw: number;
        if (levels) {
          const bin = 1 + Math.round(Math.pow(frac, 1.7) * 52);
          const gain = 0.9 + frac * 2.1;
          raw = Math.min(1, (levels[Math.min(bin, levels.length - 1)] / 255) * gain);
          raw *= raw;
        } else {
          raw = 0.06 + Math.sin(time / 1500 + frac * 4.2) * 0.045;
        }
        amps[i] = Math.max(amps[i] * decay, raw);
        loud += amps[i];
      }
      loud /= BARS;

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "butt";
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = "rgba(255,255,255,0.26)";
      ctx.beginPath();
      for (let r = 0; r < ROUNDS; r++) {
        const base = rotation + r * roundStep;
        for (let i = 0; i < BARS; i++) {
          const angle = base + i * step;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const len = (0.1 + amps[i] * 0.88) * maxLen;
          ctx.moveTo(centre + cos * radius, centre + sin * radius);
          ctx.lineTo(centre + cos * (radius + len), centre + sin * (radius + len));
        }
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";

      if (node) {
        const playback = getPlayback();
        let beat = 0;
        if (playback?.playing && track && track.bpm > 0) {
          const beatMs = 60000 / track.bpm;
          const phase =
            (((playback.position - track.beatOffsetMs) % beatMs) + beatMs) % beatMs;
          beat = Math.pow(1 - phase / beatMs, 5);
        }
        const scale = 1 + beat * 0.05 + Math.min(0.035, loud * 0.5);
        node.style.transform = `scale(${scale.toFixed(4)})`;
      }
    };

    if (!reduced) raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      if (node) node.style.transform = "";
    };
  }, [size, pad, pulseRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700 ${
        active ? "opacity-100" : "opacity-70"
      }`}
      style={{ width: size + pad * 2, height: size + pad * 2 }}
    />
  );
}
