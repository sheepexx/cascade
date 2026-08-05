import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MenuMusic } from "../hooks/useMenuMusic";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
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
const BG_FADE_MS = 900;
const RING_RATIO = 0.42;
const ROUNDS = 3;
const BARS = 32;
const SKEW = "-11deg";
const BAR_ALPHA = 0.26;
const SPIN_SPEED = 0.00009;
const AMP_SHIFT_MS = 140;
const AMP_GAIN = 1;
const AMP_DECAY_PER_MS = 0.0011;
const BAR_FLOOR = 0.05;
const BAR_REACH = 0.95;
const MASK_LOBES = 4;
const MASK_STEPS = 7;
const MASK_SPEED = 0.0018;
const MASK_DIM = 0.2;
const MASK_EDGE_LOW = 0.35;
const MASK_EDGE_HIGH = 0.9;

const SEAM_FADE = `linear-gradient(to bottom, ${Array.from(
  { length: 21 },
  (_, i) => {
    const t = i / 20;
    const a = t * t * (3 - 2 * t);
    return `rgba(15,15,20,${a.toFixed(4)}) ${(t * 100).toFixed(1)}%`;
  },
).join(", ")})`;

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
  const t = useT();
  const pulseRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barHovered, setBarHovered] = useState(false);
  const musicRef = useRef(music);
  musicRef.current = music;

  useEffect(() => {
    const node = barRef.current;
    if (!node || !barHovered) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { getPlayback, track } = musicRef.current;
      const playback = getPlayback();
      let beat = 0;
      if (playback?.playing && track && track.bpm > 0) {
        const beatMs = 60000 / track.bpm;
        const phase =
          (((playback.position - track.beatOffsetMs) % beatMs) + beatMs) % beatMs;
        beat = Math.pow(1 - phase / beatMs, 5);
      }
      node.style.setProperty("--beat", beat.toFixed(3));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node.style.removeProperty("--beat");
    };
  }, [barHovered]);

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

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(7rem,22vh,16rem)]"
          style={{ backgroundImage: SEAM_FADE }}
        />

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
              className={`absolute inset-y-0 left-0 bg-ink-800/90 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-transform duration-300 ease-out ${
                open ? "scale-y-100" : "scale-y-50"
              }`}
              style={{ width: `calc(50% + ${shift - logoOpen / 2}px)` }}
            />
            <div
              className={`absolute inset-y-0 right-0 bg-ink-800/90 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-transform duration-300 ease-out ${
                open ? "scale-y-100" : "scale-y-50"
              }`}
              style={{ left: `calc(50% + ${shift + logoOpen / 2}px)` }}
            />
            <div
              ref={barRef}
              onMouseEnter={() => setBarHovered(true)}
              onMouseLeave={() => setBarHovered(false)}
              className={`absolute inset-0 flex justify-center ${
                open ? "pointer-events-auto" : "pointer-events-none"
              }`}
            >
              {left.map((a, i) => (
                <Panel
                  key={a.id}
                  action={a}
                  width={panel}
                  open={open}
                  bleedRight={i === left.length - 1 ? logoOpen / 2 + 2 : 0}
                />
              ))}
              <div style={{ width: logoOpen }} />
              {right.map((a, i) => (
                <Panel
                  key={a.id}
                  action={a}
                  width={panel}
                  open={open}
                  bleedLeft={i === 0 ? logoOpen / 2 + 2 : 0}
                />
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

        <div className="absolute bottom-3 right-4 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-600">
          <span>Cascade · v{__APP_VERSION__}</span>
          <span aria-hidden>·</span>
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-slate-400"
          >
            {t("startModal.privacyPolicy")}
          </a>
        </div>
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
  bleedLeft = 0,
  bleedRight = 0,
}: {
  action: MenuAction;
  width: number;
  open: boolean;
  bleedLeft?: number;
  bleedRight?: number;
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
        className="menu-panel-face absolute inset-y-0"
        style={
          {
            background: action.color,
            "--menu-skew": SKEW,
            left: -1 - bleedLeft,
            right: -1 - bleedRight,
          } as React.CSSProperties
        }
      />
      <span className="relative flex h-full flex-col items-center justify-center gap-2">
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
  const [layers, setLayers] = useState<{ id: number; url: string }[]>([]);
  const [clearing, setClearing] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    if (!url) {
      setLayers((prev) => {
        if (prev.length) setClearing(true);
        return prev;
      });
      return;
    }
    setClearing(false);
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      setLayers((prev) => [...prev.slice(-1), { id: nextId.current++, url }]);
    };
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [url]);

  useEffect(() => {
    if (layers.length < 2) return;
    const id = window.setTimeout(
      () => setLayers((prev) => prev.slice(-1)),
      BG_FADE_MS,
    );
    return () => window.clearTimeout(id);
  }, [layers]);

  useEffect(() => {
    if (!clearing) return;
    const id = window.setTimeout(() => {
      setLayers([]);
      setClearing(false);
    }, BG_FADE_MS);
    return () => window.clearTimeout(id);
  }, [clearing]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.3]">
        {layers.map((layer, i) => (
          <img
            key={layer.id}
            src={layer.url}
            alt=""
            aria-hidden
            className={`absolute inset-0 h-full w-full scale-105 object-cover blur-[2px] ${
              i === layers.length - 1
                ? clearing
                  ? "bg-fade-out"
                  : "bg-fade-in"
                : ""
            }`}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900/80 via-ink-900/66 to-ink-900/88" />
    </div>
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
    const roundStep = (Math.PI * 2) / ROUNDS;
    const step = roundStep / BARS;
    const segments = ROUNDS * BARS;
    const segX0 = new Float32Array(segments);
    const segY0 = new Float32Array(segments);
    const segX1 = new Float32Array(segments);
    const segY1 = new Float32Array(segments);
    const segLevel = new Uint8Array(segments);
    const maskStrokes = Array.from({ length: MASK_STEPS }, (_, level) => {
      const frac = level / (MASK_STEPS - 1);
      const alpha = BAR_ALPHA * (MASK_DIM + (1 - MASK_DIM) * frac);
      return `rgba(255,255,255,${alpha.toFixed(3)})`;
    });
    let rotation = 0;
    let maskAngle = 0;
    let indexOffset = 0;
    let sinceAmps = 0;
    let last = 0;
    let raf = 0;

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const delta = last ? Math.min(64, time - last) : 16;
      last = time;
      rotation += delta * SPIN_SPEED;
      maskAngle -= delta * MASK_SPEED;
      ctx.clearRect(0, 0, box, box);

      const { readLevels, getPlayback, track } = musicRef.current;
      const amps = smoothRef.current;

      const levels = readLevels();
      const seconds = time / 1000;
      for (let i = 0; i < BARS; i++) {
        let target: number;
        if (levels) {
          const bin = (i + indexOffset) % BARS;
          target = Math.min(1, (levels[bin] / 255) * AMP_GAIN);
        } else {
          target =
            0.16 +
            Math.sin(i * 0.7 + seconds * 1.9) * 0.09 +
            Math.sin(i * 0.23 - seconds * 1.1) * 0.055;
          if (target < 0.02) target = 0.02;
        }
        if (target > amps[i]) amps[i] = target;
      }

      sinceAmps += delta;
      if (sinceAmps >= AMP_SHIFT_MS) {
        sinceAmps -= AMP_SHIFT_MS;
        indexOffset = (indexOffset + 1) % BARS;
      }

      const drop = delta * AMP_DECAY_PER_MS;
      let loud = 0;
      for (let i = 0; i < BARS; i++) {
        amps[i] -= drop;
        if (amps[i] < 0) amps[i] = 0;
        loud += amps[i];
      }
      loud /= BARS;

      let seg = 0;
      for (let r = 0; r < ROUNDS; r++) {
        const base = rotation + r * roundStep;
        for (let i = 0; i < BARS; i++) {
          const angle = base + i * step;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const len = (BAR_FLOOR + amps[i] * BAR_REACH) * maxLen;
          segX0[seg] = centre + cos * radius;
          segY0[seg] = centre + sin * radius;
          segX1[seg] = centre + cos * (radius + len);
          segY1[seg] = centre + sin * (radius + len);
          const lobe = Math.abs(
            Math.cos((MASK_LOBES / 2) * (angle - maskAngle)),
          );
          segLevel[seg] = Math.round(
            smoothstep(MASK_EDGE_LOW, MASK_EDGE_HIGH, lobe) * (MASK_STEPS - 1),
          );
          seg++;
        }
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "butt";
      ctx.lineWidth = 1.3;
      for (let level = 0; level < MASK_STEPS; level++) {
        ctx.strokeStyle = maskStrokes[level];
        ctx.beginPath();
        for (let s = 0; s < segments; s++) {
          if (segLevel[s] !== level) continue;
          ctx.moveTo(segX0[s], segY0[s]);
          ctx.lineTo(segX1[s], segY1[s]);
        }
        ctx.stroke();
      }
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
