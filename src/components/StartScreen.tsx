import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MenuMusic } from "../hooks/useMenuMusic";
import { usePhoneViewport } from "../hooks/usePhoneViewport";
import type { OnlinePlayer } from "../hooks/useOnlinePresence";
import { useAuth } from "../lib/auth";
import { canExitDesktop } from "../lib/desktopExit";
import { useT, type MessageKey, type Translate } from "../lib/i18n";
import { countLocalProjects } from "../lib/persistence";
import {
  ImportIcon,
  LibraryIcon,
  NewMapIcon,
  PackCreatorIcon,
  PowerIcon,
  SampleMapsIcon,
  SettingsIcon,
} from "./ui/StartIcons";

type MenuAction = {
  id: string;
  label: string;
  icon: ReactNode;
  color: string;
  onClick: () => void;
};

const IDLE_BPM = 59;
const LOGO_CLOSED = 300;
const LOGO_OPEN = 196;
const LOGO_MIN = 168;
const BAR_HEIGHT = 136;
const PANEL_MAX = 152;
const PANEL_MIN = 104;
const PANEL_FLOOR = 86;
const LEFT_PANELS = 2;
const RIGHT_PANELS = 4;
const BG_FADE_MS = 900;
const PARALLAX_PX = 10;
const PARALLAX_EASE = 7;
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

const KIAI_FADE_IN_MS = 110;
const KIAI_FADE_OUT_MS = 460;
const KIAI_GLOW_BASE = 0.1;
const KIAI_GLOW_BEAT = 0.22;
const KIAI_GLOW_TAIL = 0.6;
const KIAI_BURST_GLOW = 0.12;
const KIAI_BURST_DECAY_MS = 700;
const STARS_PER_SIDE = 26;
const STAR_OPENING = 0.45;
const STAR_EMIT_MS = 380;
const STAR_SPRITE = 64;
const STAR_LIFE_MS = 1400;
const STAR_REACH = 0.62;
const STAR_END_SPEED = 0.26;
const STAR_ALPHA = 0.6;
const STAR_FADE_FROM = 0.45;
const STAR_MAX = 160;

const SEAM_FADE = `linear-gradient(to bottom, ${Array.from(
  { length: 21 },
  (_, i) => {
    const t = i / 20;
    const a = t * t * (3 - 2 * t);
    return `rgba(15,15,20,${a.toFixed(4)}) ${(t * 100).toFixed(1)}%`;
  },
).join(", ")})`;

const KIAI_GLOW_STOPS = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  const a = Math.pow(1 - t, 3.4);
  return `rgba(255,250,240,${a.toFixed(4)}) ${(t * 100).toFixed(1)}%`;
}).join(", ");
const KIAI_GLOW_LEFT = `linear-gradient(to right, ${KIAI_GLOW_STOPS})`;
const KIAI_GLOW_RIGHT = `linear-gradient(to left, ${KIAI_GLOW_STOPS})`;

function PhoneStart({
  music,
  players,
  children,
}: {
  music: MenuMusic;
  players?: OnlinePlayer[];
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="h-full overflow-y-auto">
      <div className="relative min-h-full overflow-hidden">
        <MenuBackground
          url={music.track?.backgroundUrl ?? null}
          players={players ?? []}
          phone
          open={false}
          viewportKey="phone"
        />

        {/* Clears the floating header, which on phones is the only way to
            reach sign-in and the account menu. */}
        <div className="relative px-5 pt-24">
          <div className="flex flex-col items-center text-center">
            <img
              src="/logo.png?v=3"
              alt=""
              aria-hidden
              className="h-24 w-24 drop-shadow-[0_0_28px_rgba(244,90,90,0.35)]"
            />
            <p className="mt-4 text-2xl font-bold tracking-tight text-white">
              Cascade
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
              VSRG Editor
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-ink-800/80 p-5 text-center backdrop-blur-sm">
            <p className="text-base font-semibold text-slate-100">
              {t("mobile.desktopTitle")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {t("mobile.desktopBody")}
            </p>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

export function StartScreen({
  music,
  onOpenChange,
  onMyMaps,
  onNewMap,
  onPackCreator,
  onTryMaps,
  onImport,
  onSettings,
  onExit,
  children,
  players,
}: {
  music: MenuMusic;
  onOpenChange?: (open: boolean) => void;
  onMyMaps: () => void;
  onNewMap: () => void;
  onPackCreator: () => void;
  onTryMaps: () => void;
  onImport: () => void;
  onSettings: () => void;
  onExit?: () => void;
  children?: ReactNode;
  players?: OnlinePlayer[];
}) {
  const counts = menuPanelCounts(Boolean(onExit));
  const panels = counts.left + counts.right;
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(() => measure(panels));
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const phone = usePhoneViewport();
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
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      node.style.setProperty(
        "--beat",
        beatPulse(musicRef.current, time).toFixed(3),
      );
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node.style.removeProperty("--beat");
    };
  }, [barHovered]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  useEffect(() => {
    const update = () => setLayout(measure(panels));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [panels]);

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
    ...(onExit
      ? [
          {
            id: "exit",
            label: t("menu.exit"),
            icon: <PowerIcon className="h-7 w-7" />,
            color: "#b3323c",
            onClick: onExit,
          },
        ]
      : []),
    {
      id: "import",
      label: t("menu.importMap"),
      icon: <ImportIcon className="h-7 w-7" />,
      color: "#3c3c46",
      onClick: onImport,
    },
    {
      id: "settings",
      label: t("menu.settings"),
      icon: <SettingsIcon className="h-7 w-7" />,
      color: "#367f8e",
      onClick: onSettings,
    },
  ];

  const right: MenuAction[] = [
    {
      id: "myMaps",
      label: t("menu.myMaps"),
      icon: <LibraryIcon className="h-7 w-7" />,
      color: "#7c4dd8",
      onClick: onMyMaps,
    },
    {
      id: "new",
      label: t("menu.newMap"),
      icon: <NewMapIcon className="h-7 w-7" />,
      color: "#e86868",
      onClick: onNewMap,
    },
    {
      id: "pack",
      label: t("menu.packCreator"),
      icon: <PackCreatorIcon className="h-7 w-7" />,
      color: "#e0972f",
      onClick: onPackCreator,
    },
    {
      id: "try",
      label: t("menu.tryMaps"),
      icon: <SampleMapsIcon className="h-7 w-7" />,
      color: "#7fb03a",
      onClick: onTryMaps,
    },
  ];

  const { wide, panel, logoOpen, logoClosed } = layout;
  const shift = logoShift(left.length, right.length, panel);
  const logoSize = open ? logoOpen : logoClosed;

  if (phone) {
    return <PhoneStart music={music} players={players}>{children}</PhoneStart>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative grid min-h-full place-items-center overflow-hidden">
        <MenuBackground
          url={music.track?.backgroundUrl ?? null}
          players={players ?? []}
          phone={false}
          open={open}
          viewportKey={`${layout.vw}x${layout.vh}`}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(7rem,22vh,16rem)]"
          style={{ backgroundImage: SEAM_FADE }}
        />

        <KiaiEffects music={music} />

        {open && (
          <button
            type="button"
            aria-label={t("menu.close")}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 z-0 cursor-default"
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
            {t(greetingKey())}
            {user ? `, ${user.username}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 drop-shadow">
            {projectCount === null
              ? " "
              : projectCount === 0
                ? t("menu.noLocalProjects")
                : t("menu.localProjects", { count: projectCount })}
          </p>
        </div>

        {wide ? (
          <div
            className={`pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 transition-all duration-300 ease-out ${
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
            className={`absolute inset-x-0 z-20 flex justify-center px-3 transition-all duration-300 ease-out ${
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
          aria-label={t("menu.open")}
          aria-expanded={open}
          className="group absolute left-1/2 top-1/2 z-20 outline-none transition-transform duration-300 ease-out"
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
              src={`${import.meta.env.BASE_URL}logo.png?v=3`}
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

function greetingKey(): MessageKey {
  const hour = new Date().getHours();
  if (hour < 5) return "menu.goodNight";
  if (hour < 12) return "menu.goodMorning";
  if (hour < 18) return "menu.goodAfternoon";
  if (hour < 23) return "menu.goodEvening";
  return "menu.goodNight";
}

function menuPanelCounts(canExit: boolean): { left: number; right: number } {
  return { left: LEFT_PANELS + (canExit ? 1 : 0), right: RIGHT_PANELS };
}

function logoShift(left: number, right: number, panel: number): number {
  return ((left - right) * panel) / 2;
}

function measure(panels: number) {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const wide = vw >= 900 && vh >= 560;
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
  const base = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(vw / 8.6)));
  const panel =
    wide && panels > 0
      ? Math.max(
          PANEL_FLOOR,
          Math.min(base, Math.floor((vw - logoOpen) / panels)),
        )
      : base;
  return { vw, vh, wide, panel, logoOpen, logoClosed };
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

function MenuBackground({
  url,
  players,
  phone,
  open,
  viewportKey,
}: {
  url: string | null;
  players: OnlinePlayer[];
  phone: boolean;
  open: boolean;
  viewportKey: string;
}) {
  const [layers, setLayers] = useState<{ id: number; url: string }[]>([]);
  const [clearing, setClearing] = useState(false);
  const nextId = useRef(0);
  const parallaxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = parallaxRef.current;
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let last = 0;
    let raf = 0;

    const apply = () => {
      node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    };
    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const amount = 1 - Math.exp(-PARALLAX_EASE * dt);
      x += (targetX - x) * amount;
      y += (targetY - y) * amount;
      if (Math.abs(targetX - x) < 0.05 && Math.abs(targetY - y) < 0.05) {
        x = targetX;
        y = targetY;
        apply();
        raf = 0;
        return;
      }
      apply();
      raf = requestAnimationFrame(frame);
    };
    const move = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      targetX = (e.clientX / w - 0.5) * 2 * PARALLAX_PX;
      targetY = (e.clientY / h - 0.5) * 2 * PARALLAX_PX;
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

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
      <div ref={parallaxRef} className="absolute inset-0 opacity-[0.3] will-change-transform">
        {layers.map((layer, i) => (
          <img
            key={layer.id}
            src={layer.url}
            alt=""
            aria-hidden
            className={`absolute inset-0 h-full w-full scale-110 object-cover blur-[2px] ${
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
      {open && (
        <FloatingPlayers key={viewportKey} players={players} phone={phone} />
      )}
    </div>
  );
}

const FLOAT_MAX_COUNT = 4;
// Faces swap in and out of the background layer on a gentle rhythm so the
// menu never shows the same cast twice in a row.
const FLOAT_ROTATE_MS = 9_000;

// Faces keep at least this much distance (in px) between their centers, so
// the scatter reads as spread out no matter where each one lands.
const FLOAT_MIN_GAP_DESKTOP = 190;
const FLOAT_MIN_GAP_PHONE = 130;

const FLOAT_TOP_GAP_PX = 110;
const FLOAT_EDGE_GAP_PX = 18;
const FLOAT_UI_GAP_PX = 18;
const FLOAT_SLOT_ATTEMPTS = 120;

type FloatRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type AvatarSlot = {
  x: number;
  y: number;
  size: number;
  driftX: number;
  bobY: number;
  tilt: number;
  duration: number;
  delay: number;
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rectsOverlap(a: FloatRect, b: FloatRect): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

function protectedMenuRects(vw: number, vh: number): FloatRect[] {
  const counts = menuPanelCounts(canExitDesktop());
  const { wide, panel, logoOpen, logoClosed } = measure(
    counts.left + counts.right,
  );
  const centerY = vh / 2;
  const logoSize = wide ? logoOpen : logoClosed;
  const logoRadius = logoSize * (0.5 + RING_RATIO) + FLOAT_UI_GAP_PX;
  const logoCenterX = wide
    ? vw / 2 + logoShift(counts.left, counts.right, panel)
    : vw / 2;
  const greetingBottom =
    centerY -
    (wide ? Math.max(BAR_HEIGHT / 2, logoOpen / 2) : logoClosed / 2) -
    32;
  const rects: FloatRect[] = [
    {
      left: logoCenterX - logoRadius,
      top: centerY - logoRadius,
      right: logoCenterX + logoRadius,
      bottom: centerY + logoRadius,
    },
    {
      left: vw / 2 - 230,
      top: greetingBottom - 64,
      right: vw / 2 + 230,
      bottom: greetingBottom + FLOAT_UI_GAP_PX,
    },
    {
      left: vw - 280,
      top: vh - 52,
      right: vw,
      bottom: vh,
    },
  ];

  if (wide) {
    rects.push({
      left: 0,
      top: centerY - BAR_HEIGHT / 2 - FLOAT_UI_GAP_PX,
      right: vw,
      bottom: centerY + BAR_HEIGHT / 2 + FLOAT_UI_GAP_PX,
    });
  } else {
    const actionsTop = centerY + logoClosed / 2 + 22;
    rects.push({
      left: 0,
      top: actionsTop - FLOAT_UI_GAP_PX,
      right: vw,
      bottom: Math.min(vh, actionsTop + 230),
    });
  }

  return rects;
}

function makeSlot(phone: boolean, occupied: AvatarSlot[]): AvatarSlot | null {
  const size = phone ? 34 + Math.random() * 8 : 48 + Math.random() * 8;
  const minGap = phone ? FLOAT_MIN_GAP_PHONE : FLOAT_MIN_GAP_DESKTOP;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const driftX = phone ? 26 + Math.random() * 22 : 44 + Math.random() * 34;
  const bobY = phone ? 12 + Math.random() * 10 : 18 + Math.random() * 14;
  const travelWidth = size + driftX + 6;
  const travelHeight = size + bobY + 6;
  const minX = FLOAT_EDGE_GAP_PX;
  const maxX = vw - FLOAT_EDGE_GAP_PX - travelWidth;
  const minY = Math.max(FLOAT_EDGE_GAP_PX, FLOAT_TOP_GAP_PX);
  const maxY = vh - FLOAT_EDGE_GAP_PX - travelHeight;
  if (maxX < minX || maxY < minY) return null;

  const protectedRects = protectedMenuRects(vw, vh);
  let fallback: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < FLOAT_SLOT_ATTEMPTS; attempt++) {
    const px = minX + Math.random() * (maxX - minX);
    const py = minY + Math.random() * (maxY - minY);
    const travel: FloatRect = {
      left: px,
      top: py,
      right: px + travelWidth,
      bottom: py + travelHeight,
    };
    if (protectedRects.some((rect) => rectsOverlap(travel, rect))) continue;
    fallback ??= { x: px, y: py };
    const farEnough = occupied.every((o) => {
      const dx = px + size / 2 - ((o.x / 100) * vw + o.size / 2);
      const dy = py + size / 2 - ((o.y / 100) * vh + o.size / 2);
      return Math.sqrt(dx * dx + dy * dy) >= minGap;
    });
    if (farEnough) {
      fallback = { x: px, y: py };
      break;
    }
  }
  if (!fallback) return null;

  return {
    x: (fallback.x / vw) * 100,
    y: (fallback.y / vh) * 100,
    size,
    driftX,
    bobY,
    tilt: (Math.random() - 0.5) * 4,
    duration: phone ? 26_000 + Math.random() * 14_000 : 36_000 + Math.random() * 20_000,
    delay: -Math.random() * 16_000,
  };
}

function formatLastSeen(ts: number | null, t: Translate): string | null {
  if (ts == null) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (minutes < 1) return t("menu.justNow");
  if (minutes < 60) return t("menu.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("menu.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("menu.daysAgo", { n: days });
  return new Date(ts).toLocaleDateString();
}

function FloatingPlayers({
  players,
  phone,
}: {
  players: OnlinePlayer[];
  phone: boolean;
}) {
  const t = useT();
  const limit = FLOAT_MAX_COUNT;
  const slotsRef = useRef<Map<string, AvatarSlot | null>>(new Map());
  const [shown, setShown] = useState<OnlinePlayer[]>([]);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // Only a subset of the roster floats at a time; every so often a face leaves
  // and a fresh one joins so the background never looks static.
  const ordered = [...players].sort((a, b) => hashId(a.id) - hashId(b.id));

  useEffect(() => {
    setShown((prev) => {
      const keep = prev.filter((p) => players.some((q) => q.id === p.id));
      const fill = ordered
        .filter((p) => !keep.some((q) => q.id === p.id))
        .slice(0, Math.max(0, limit - keep.length));
      return [...keep, ...fill];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, limit]);

  useEffect(() => {
    if (players.length <= limit) return;
    const swap = () => {
      const current = shownRef.current;
      if (current.length === 0) return;
      const pool = ordered.filter((p) => !current.some((q) => q.id === p.id));
      if (pool.length === 0) return;
      const out = current[Math.floor(Math.random() * current.length)];
      const add = pool[Math.floor(Math.random() * pool.length)];
      const used = [...slotsRef.current.entries()]
        .filter(([id, slot]) => id !== out.id && id !== add.id && slot !== null)
        .map(([, slot]) => slot as AvatarSlot);
      slotsRef.current.set(add.id, makeSlot(phone, used));
      slotsRef.current.delete(out.id);
      setShown((prev) => [...prev.filter((p) => p.id !== out.id), add]);
    };
    const id = window.setInterval(swap, FLOAT_ROTATE_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, limit]);

  const occupied: AvatarSlot[] = [];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {shown.slice(0, limit).map((p, i) => {
        if (!slotsRef.current.has(p.id)) {
          slotsRef.current.set(p.id, makeSlot(phone, occupied));
        }
        const slot = slotsRef.current.get(p.id);
        if (!slot) return null;
        occupied.push(slot);
        const online = p.online;
        const color = online ? "#3fdc8c" : "#78818f";
        const lastSeen = online ? null : formatLastSeen(p.lastSeen, t);
        const tipAbove = slot.y > 50;
        const profileUrl =
          p.osuId != null
            ? `https://osu.ppy.sh/users/${p.osuId}`
            : undefined;
        return (
          <a
            key={p.id}
            href={profileUrl}
            target={profileUrl ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="float-player-in group absolute pointer-events-auto"
            style={
              {
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                width: slot.size,
                height: slot.size,
                "--reveal-delay": `${i * 70}ms`,
              } as React.CSSProperties
            }
          >
            <div
              className="float-player-drift"
              style={
                {
                  "--drift-x": `${slot.driftX}px`,
                  "--tilt": `${slot.tilt}deg`,
                  "--float-duration": `${slot.duration}ms`,
                  "--float-delay": `${slot.delay}ms`,
                } as React.CSSProperties
              }
            >
              <div
                className="float-player-bob"
                style={
                  {
                    "--bob-y": `${slot.bobY}px`,
                  } as React.CSSProperties
                }
              >
                <div className="relative h-full w-full">
                  <span
                    className="absolute -inset-1.5 rounded-full blur-[10px]"
                    style={{ background: color, opacity: online ? 0.3 : 0.12 }}
                  />
                  <img
                    src={p.avatar ?? undefined}
                    alt=""
                    draggable={false}
                    className={`h-full w-full rounded-full object-cover transition-opacity duration-700 ${
                      online ? "opacity-95" : "opacity-70 grayscale brightness-[0.72]"
                    }`}
                    style={{
                      border: `2px solid ${color}`,
                      boxShadow: online ? `0 0 16px ${color}55` : "none",
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              className={`pointer-events-none absolute left-1/2 z-20 w-max ${
                tipAbove ? "bottom-full mb-1.5" : "top-full mt-1.5"
              }`}
            >
              <div
                className="float-player-drift"
                style={
                  {
                    "--drift-x": `${slot.driftX}px`,
                    "--tilt": "0deg",
                    "--float-duration": `${slot.duration}ms`,
                    "--float-delay": `${slot.delay}ms`,
                  } as React.CSSProperties
                }
              >
                <div
                  className="float-player-bob"
                  style={
                    {
                      "--bob-y": `${slot.bobY}px`,
                      "--float-duration": `${slot.duration}ms`,
                      "--float-delay": `${slot.delay}ms`,
                    } as React.CSSProperties
                  }
                >
                  <div className="float-player-tip-card flex w-max -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl border border-ink-500/70 bg-ink-900/95 px-3 py-2.5 shadow-2xl">
                    <span
                      className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border-2 bg-ink-700/70 text-lg font-semibold text-slate-100 shadow-md"
                      style={{ borderColor: color }}
                    >
                      {p.avatar ? (
                        <img
                          src={p.avatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        p.username.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="block max-w-[8.5rem] truncate text-xs font-semibold text-slate-100">
                      {p.username}
                    </span>
                    <span className="block max-w-[8.5rem] text-center text-[10px] text-slate-400">
                      {online
                        ? `${t("menu.workingOn")}: ${p.status || "—"}`
                        : lastSeen
                          ? `${t("menu.offline")} · ${t("menu.lastSeen", {
                              time: lastSeen,
                            })}`
                          : t("menu.offline")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pulseAt(period: number, position: number): number {
  const phase = ((position % period) + period) % period;
  return Math.pow(1 - phase / period, 5);
}

function beatPulse(music: MenuMusic, now: number): number {
  const { track } = music;
  const playback = music.getPlayback();
  if (playback?.playing && track && track.bpm > 0) {
    return pulseAt(60000 / track.bpm, playback.position - track.beatOffsetMs);
  }
  if (music.hasPlaylist) return 0;
  return pulseAt(60000 / IDLE_BPM, now);
}

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  ttl: number;
  size: number;
  rot: number;
  spin: number;
};

function makeStarSprite(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = STAR_SPRITE;
  canvas.height = STAR_SPRITE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const mid = STAR_SPRITE / 2;
  const outer = mid * 0.46;
  const inner = outer * 0.42;
  const halo = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  halo.addColorStop(0, "rgba(255,255,255,0.5)");
  halo.addColorStop(0.34, "rgba(255,242,224,0.14)");
  halo.addColorStop(1, "rgba(255,226,190,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, STAR_SPRITE, STAR_SPRITE);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = mid + Math.cos(angle) * radius;
    const py = mid + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.shadowColor = "rgba(255,244,224,0.9)";
  ctx.shadowBlur = mid * 0.45;
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  return canvas;
}

function KiaiEffects({ music }: { music: MenuMusic }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLCanvasElement | null>(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const active = music.isPlaying && (music.track?.kiai.length ?? 0) > 0;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!canvas || !left || !right) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    if (!spriteRef.current) spriteRef.current = makeStarSprite();
    const sprite = spriteRef.current;

    let width = 1;
    let height = 1;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const stars: Star[] = [];
    let envelope = 0;
    let burst = 0;
    let pending = 0;
    let emitted = 0;
    let wasKiai = false;
    let painted = false;
    let last = 0;
    let raf = 0;

    const spawn = (count: number) => {
      const inset = Math.max(30, Math.min(120, width * 0.07));
      const reach = height * STAR_REACH;
      for (let side = -1; side <= 1; side += 2) {
        const originX = side < 0 ? inset : width - inset;
        for (let i = 0; i < count; i++) {
          const angle =
            -Math.PI / 2 -
            side * (0.04 + Math.random() * 0.13) +
            (Math.random() - 0.5) * 0.26;
          const ttl = STAR_LIFE_MS * (0.86 + Math.random() * 0.28);
          const seconds = ttl / 1000;
          const distance = reach * (0.62 + Math.random() * 0.38);
          const velocity = (2 * distance) / (seconds * (1 + STAR_END_SPEED));
          stars.push({
            x: originX + (Math.random() - 0.5) * 44,
            y: height + 6 + Math.random() * 26,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            gravity: (velocity * (1 - STAR_END_SPEED)) / seconds,
            life: 0,
            ttl,
            size: 11 + Math.random() * 15,
            rot: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 3.4,
          });
        }
      }
      if (stars.length > STAR_MAX) stars.splice(0, stars.length - STAR_MAX);
    };

    const fire = () => {
      const opening = Math.round(STARS_PER_SIDE * STAR_OPENING);
      pending = STARS_PER_SIDE - opening;
      emitted = 0;
      burst = 1;
      spawn(opening);
    };

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const delta = last ? Math.min(64, time - last) : 16;
      last = time;

      const current = musicRef.current;
      const playback = current.getPlayback();
      const ranges = current.track?.kiai;
      const inKiai =
        !!playback?.playing &&
        !!ranges &&
        ranges.some(
          (r) => playback.position >= r.start && playback.position < r.end,
        );

      if (inKiai && !wasKiai) fire();
      wasKiai = inKiai;

      if (pending > 0) {
        emitted +=
          (delta * STARS_PER_SIDE * (1 - STAR_OPENING)) / STAR_EMIT_MS;
        const due = Math.min(pending, Math.floor(emitted));
        if (due > 0) {
          emitted -= due;
          pending -= due;
          spawn(due);
        }
      }

      envelope = inKiai
        ? Math.min(1, envelope + delta / KIAI_FADE_IN_MS)
        : Math.max(0, envelope - delta / KIAI_FADE_OUT_MS);
      burst = Math.max(0, burst - delta / KIAI_BURST_DECAY_MS);

      const beat = Math.pow(beatPulse(current, time), KIAI_GLOW_TAIL);
      const glow = Math.min(
        1,
        envelope * (KIAI_GLOW_BASE + KIAI_GLOW_BEAT * beat) +
          burst * burst * KIAI_BURST_GLOW,
      );
      const opacity = glow.toFixed(3);
      left.style.opacity = opacity;
      right.style.opacity = opacity;

      if (!stars.length) {
        if (painted) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          painted = false;
        }
        return;
      }

      const seconds = delta / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i];
        star.life += delta;
        if (star.life >= star.ttl) {
          stars.splice(i, 1);
          continue;
        }
        star.vy += star.gravity * seconds;
        star.x += star.vx * seconds;
        star.y += star.vy * seconds;
        star.rot += star.spin * seconds;

        const age = star.life / star.ttl;
        const alpha =
          STAR_ALPHA *
          Math.min(1, star.life / 70) *
          (age < STAR_FADE_FROM ? 1 : (1 - age) / (1 - STAR_FADE_FROM)) *
          (0.86 + 0.14 * Math.sin(star.life * 0.018 + star.rot));
        if (alpha <= 0.01) continue;
        const scale = (star.size / STAR_SPRITE) * dpr;
        const cos = Math.cos(star.rot) * scale;
        const sin = Math.sin(star.rot) * scale;
        ctx.globalAlpha = alpha;
        ctx.setTransform(cos, sin, -sin, cos, star.x * dpr, star.y * dpr);
        ctx.drawImage(sprite, -STAR_SPRITE / 2, -STAR_SPRITE / 2);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      painted = true;
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      left.style.opacity = "0";
      right.style.opacity = "0";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        ref={leftRef}
        className="absolute inset-y-0 left-0 w-[min(24%,17rem)] opacity-0 mix-blend-screen"
        style={{ backgroundImage: KIAI_GLOW_LEFT }}
      />
      <div
        ref={rightRef}
        className="absolute inset-y-0 right-0 w-[min(24%,17rem)] opacity-0 mix-blend-screen"
        style={{ backgroundImage: KIAI_GLOW_RIGHT }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full mix-blend-screen"
      />
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

      const { readLevels } = musicRef.current;
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
        const beat = beatPulse(musicRef.current, time);
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
