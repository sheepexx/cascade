import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { MenuMusic } from "../hooks/useMenuMusic";
import { BeatBounce, LoudnessTracker, bounceTransform } from "../lib/beatBounce";
import {
  AudioPunch,
  CriticalSpring,
  FLASH_FADE_IN_MS,
  SideFlash,
  beatAt,
  beatShape,
  flashPeak,
  flashSides,
  idleBeat,
  type MenuBeat,
} from "../lib/menuPulse";
import {
  LOGO_SAMPLE_EARLY_MS,
  LogoHitsounds,
  type LogoSampleSource,
} from "../lib/logoHitsounds";
import { MENU_ACCENTS } from "../lib/menuTheme";
import { usePhoneViewport } from "../hooks/usePhoneViewport";
import { isDesktopApp } from "../lib/pwa";
import { DISCORD_INVITE, siteUrl } from "../lib/siteAssets";
import { DiscordIcon } from "./ui/Icons";
import {
  DEFAULT_EDITOR_KEYBINDS,
  editorKeyLabel,
  type EditorAction,
  type EditorKeybinds,
} from "../lib/editorKeybinds";
import type { OnlinePlayer } from "../hooks/useOnlinePresence";
import { useAuth } from "../lib/auth";
import { useT, type MessageKey, type Translate } from "../lib/i18n";
import { countLocalProjects } from "../lib/persistence";
import {
  boxClear,
  guardRects,
  hashId,
  makeSlot,
  placementArea,
  rescaleSlot,
  slotBoxes,
  slotClear,
  type AvatarSlot,
} from "../lib/menuFloat";
import {
  reduceMotion,
  renderScale,
  usePerformanceMode,
  useReducedMotion,
} from "../lib/performanceMode";
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

const IDLE_BPM = 65;
const KIAI_BOOST = 1.15;
// Logo pulse while music plays: driven by the hits heard in the audio, with
// hits that land on the mapped beat pushed further, a little of the song's
// live level, and a light touch of the grid itself.
const LOGO_PUNCH_DEPTH = 0.16;
const LOGO_BEAT_ACCENT = 0.35;
const LOGO_LEVEL_DEPTH = 0.025;
const LOGO_LEVEL_FLOOR = 0.3;
const LOGO_GRID_DEPTH = 0.02;
// With nothing playing the logo breathes on the idle grid alone.
const LOGO_IDLE_DEPTH = 0.05;
// Snappy enough that a single kick shows as its own jump.
const LOGO_SPRING = 90;
const menuLoudness = new LoudnessTracker();
const logoHitsounds = new LogoHitsounds();
const LOGO_CLOSED = 640;
const LOGO_OPEN = 244;
const LOGO_MIN = 168;
const BAR_HEIGHT = 136;
const PANEL_MAX = 152;
const PANEL_MIN = 104;
const PANEL_FLOOR = 86;
const LEFT_PANELS = 2;
const RIGHT_PANELS = 4;
const BG_FADE_MS = 900;
const BG_MAX_LAYERS = 4;
// How far the menu background leans in while only the logo is showing.
const BG_CLOSED_ZOOM = 1.08;
const PARALLAX_PX = 10;
const PARALLAX_EASE = 7;
const RING_RATIO = 0.42;
const SKEW = "-11deg";
// Logo visualiser after osu!lazer's LogoVisualisation: 200 bars per ring, the
// ring laid five times around the logo, fed every 50 ms from a window of the
// spectrum that shifts five bars each time, each bar decaying in proportion
// to its own length. Outside kiai everything runs at half height.
const VIS_BARS = 200;
const VIS_ROUNDS = 5;
const VIS_INDEX_CHANGE = 5;
const VIS_UPDATE_MS = 50;
const VIS_DECAY_PER_MS = 0.0024;
// lazer's bars reach 600 units against a logo about 480 units across.
const VIS_BAR_LENGTH = 1.25;
const VIS_DEAD_ZONE = 1 / 600;
// lazer's white at 0.2 inside a visualiser drawn at half alpha.
const VIS_STROKE = "rgba(255,255,255,0.12)";
// Web Audio divides its FFT by the frame length and window; this brings its
// magnitudes up to roughly the scale BASS reports them on.
const VIS_MAGNITUDE_GAIN = 4;

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

// osu!lazer's side flash: a 0.6 → 0 gradient twice as wide as what shows,
// half of it off-screen, so the visible strip runs from 0.3 at the edge to 0.
const SIDE_FLASH_LEFT =
  "linear-gradient(to right, rgba(255,250,240,0.3), rgba(255,250,240,0))";
const SIDE_FLASH_RIGHT =
  "linear-gradient(to left, rgba(255,250,240,0.3), rgba(255,250,240,0))";

function PhoneStart({
  music,
  players,
  children,
  menuBackgroundUrl,
}: {
  music: MenuMusic;
  players?: OnlinePlayer[];
  children?: ReactNode;
  menuBackgroundUrl?: string | null;
}) {
  const t = useT();
  return (
    <div className="h-full overflow-y-auto">
      <div className="relative min-h-full overflow-hidden">
        <MenuBackground
          url={menuBackgroundUrl ?? music.track?.backgroundUrl ?? null}
          players={players ?? []}
          phone
          open={false}
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
  osuBanner,
  logoHitsoundVolume = 0,
  logoSamples = "menu",
  skinHitsounds = null,
  editorKeybinds = DEFAULT_EDITOR_KEYBINDS,
  menuTips = true,
  menuBackgroundUrl = null,
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
  /** The offer to open the map osu! is sitting on, along the bottom edge. */
  osuBanner?: ReactNode;
  /** Effects × master volume for the logo's hover hitsounds; 0 mutes them. */
  logoHitsoundVolume?: number;
  /** Which samples the logo plays on the beat while hovered. */
  logoSamples?: LogoSampleSource;
  /** The equipped skin's hitsounds, used when logoSamples is "skin". */
  skinHitsounds?: Record<string, Blob> | null;
  /** So the menu tips name the keys this user actually has bound. */
  editorKeybinds?: EditorKeybinds;
  /** The occasional "Did you know?" tips; off in Settings → General. */
  menuTips?: boolean;
  /** The account's own menu picture, when they have one and have chosen it.
   *  Null falls back to the playing song's art. */
  menuBackgroundUrl?: string | null;
}) {
  const counts = menuPanelCounts(Boolean(onExit));
  const panels = counts.left + counts.right;
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(() => measure(panels));
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const phone = usePhoneViewport();
  const lowSpec = usePerformanceMode();
  const { user } = useAuth();
  const t = useT();
  const pulseRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const stackedRef = useRef<HTMLDivElement | null>(null);
  const [stackedHeight, setStackedHeight] = useState(0);
  const [barHovered, setBarHovered] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const logoVolumeRef = useRef(logoHitsoundVolume);
  logoVolumeRef.current = logoHitsoundVolume;
  const musicRef = useRef(music);
  musicRef.current = music;
  // Held so losing osu! can slide the slab away rather than blink it out. The
  // ref is written during render the way musicRef beside it is.
  const lastBannerRef = useRef<ReactNode>(null);
  if (osuBanner) lastBannerRef.current = osuBanner;
  const [bannerSlotted, setBannerSlotted] = useState(Boolean(osuBanner));

  useEffect(() => {
    const node = barRef.current;
    if (!node || !barHovered || reduceMotion()) return;
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
    logoHitsounds.configure(logoSamples, skinHitsounds);
  }, [logoSamples, skinHitsounds]);

  // While the pointer rests on the logo, each beat plays the logo's sample.
  // Beats are caught early and only when freshly crossed, so a beat already
  // under way (or the jump when music starts) never plays off the grid.
  useEffect(() => {
    if (!logoHovered) return;
    logoHitsounds.preload();
    let last: string | null = null;
    let raf = 0;
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      const clock = beatClock(musicRef.current, time, LOGO_SAMPLE_EARLY_MS);
      const key = `${clock.point}:${clock.index}`;
      if (
        last !== null &&
        key !== last &&
        clock.index >= 0 &&
        clock.phase < LOGO_SAMPLE_EARLY_MS
      ) {
        logoHitsounds.play(
          clock.index % clock.meter === 0,
          LOGO_SAMPLE_EARLY_MS - clock.phase,
          logoVolumeRef.current,
        );
      }
      last = key;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [logoHovered]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  // A fresh element arrives every render, so this settles on the same value
  // rather than looping.
  useEffect(() => {
    if (osuBanner) setBannerSlotted(true);
  }, [osuBanner]);

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
            color: MENU_ACCENTS.exit,
            onClick: onExit,
          },
        ]
      : []),
    {
      id: "import",
      label: t("menu.importMap"),
      icon: <ImportIcon className="h-7 w-7" />,
      color: MENU_ACCENTS.import,
      onClick: onImport,
    },
    {
      id: "settings",
      label: t("menu.settings"),
      icon: <SettingsIcon className="h-7 w-7" />,
      color: MENU_ACCENTS.settings,
      onClick: onSettings,
    },
  ];

  const right: MenuAction[] = [
    {
      id: "myMaps",
      label: t("menu.myMaps"),
      icon: <LibraryIcon className="h-7 w-7" />,
      color: MENU_ACCENTS.myMaps,
      onClick: onMyMaps,
    },
    {
      id: "new",
      label: t("menu.newMap"),
      icon: <NewMapIcon className="h-7 w-7" />,
      color: MENU_ACCENTS.newMap,
      onClick: onNewMap,
    },
    {
      id: "pack",
      label: t("menu.packCreator"),
      icon: <PackCreatorIcon className="h-7 w-7" />,
      color: MENU_ACCENTS.packCreator,
      onClick: onPackCreator,
    },
    {
      id: "try",
      label: t("menu.tryMaps"),
      icon: <SampleMapsIcon className="h-7 w-7" />,
      color: MENU_ACCENTS.sampleMaps,
      onClick: onTryMaps,
    },
  ];

  const { wide, panel, logoOpen, logoClosed } = layout;
  const shift = logoShift(left.length, right.length, panel);
  const logoSize = open ? logoOpen : logoClosed;

  // Wrapped menu rows need their own space above the taller song card. Measure
  // the actual panel so translated labels and interface scaling fit too.
  useEffect(() => {
    const node = stackedRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setStackedHeight(node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [wide, phone]);

  const compactBanner = Boolean(osuBanner) && !wide && open;
  const compactCenter = Math.max(
    logoClosed / 2 + 112,
    (layout.vh - BAR_HEIGHT - stackedHeight - 22) / 2,
  );
  const menuCenter = compactBanner ? `${compactCenter}px` : "50%";

  if (phone) {
    return (
      <PhoneStart
        music={music}
        players={players}
        menuBackgroundUrl={menuBackgroundUrl}
      >
        {children}
      </PhoneStart>
    );
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div
        className="relative grid min-h-full place-items-center overflow-hidden"
        style={{
          "--menu-bar-height": `${BAR_HEIGHT}px`,
          minHeight: compactBanner
            ? Math.max(layout.vh, compactCenter + logoClosed / 2 + 22 + stackedHeight + BAR_HEIGHT + 48)
            : undefined,
        } as CSSProperties}
      >
        <MenuBackground
          url={menuBackgroundUrl ?? music.track?.backgroundUrl ?? null}
          players={players ?? []}
          phone={false}
          open={open}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(7rem,22vh,16rem)]"
          style={{ backgroundImage: SEAM_FADE }}
        />

        {!lowSpec && <SideFlashes music={music} />}

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
          className={`pointer-events-none absolute inset-x-0 flex flex-col items-center px-4 text-center transition-all duration-[var(--motion-enter)] ease-[var(--ease-emphasized)] ${
            open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
          style={{
            bottom: `calc(100% - ${menuCenter} + ${
              (wide ? Math.max(BAR_HEIGHT / 2, logoOpen / 2) : logoClosed / 2) +
              32
            }px)`,
          }}
        >
          <div data-menu-guard="">
            <p className="menu-legible text-lg font-semibold text-white">
              {t(greetingKey())}
              {user ? `, ${user.username}` : ""}
            </p>
            <p className="menu-legible mt-0.5 text-xs text-slate-200">
              {projectCount === null
                ? " "
                : projectCount === 0
                  ? t("menu.noLocalProjects")
                  : t("menu.localProjects", { count: projectCount })}
            </p>
          </div>
        </div>

        {wide && menuTips && (
          // Along the bottom edge, which the osu! banner takes over when it
          // shows, so the tips give way to it.
          <MenuTips active={open && !osuBanner} keybinds={editorKeybinds} />
        )}

        {bannerSlotted && lastBannerRef.current && (
          <div
            className={`osu-banner-slot absolute inset-x-0 bottom-0 z-10 flex justify-center px-6 ${
              osuBanner ? "" : "pointer-events-none"
            }`}
            data-state={osuBanner ? "in" : "out"}
            onAnimationEnd={(event) => {
              // The slab and its artwork animate too, and those events bubble.
              if (event.target !== event.currentTarget) return;
              if (!osuBanner) setBannerSlotted(false);
            }}
          >
            <div className="w-[min(32rem,100%)]" data-menu-guard="">
              {osuBanner ?? lastBannerRef.current}
            </div>
          </div>
        )}

        {wide ? (
          <div
            data-menu-guard=""
            className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2"
            style={{ height: BAR_HEIGHT }}
          >
            <div
              ref={barRef}
              onMouseEnter={() => setBarHovered(true)}
              onMouseLeave={() => setBarHovered(false)}
              className={`absolute inset-0 ${
                open ? "pointer-events-auto" : "pointer-events-none"
              }`}
            >
              {/* Each side is clipped at the open logo's centre and slides
                  out from under it (index.css, .menu-bar-slide). The clip
                  only trims sideways, so hovered panels can still grow past
                  the bar's top and bottom. */}
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `calc(50% + ${shift}px)`,
                  clipPath: "inset(-100% 0 -100% -100%)",
                }}
              >
                <div
                  className="menu-bar-slide relative flex h-full justify-end"
                  data-side="left"
                  data-open={open}
                  style={{ paddingRight: logoOpen / 2 }}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-ink-800/90 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-sm"
                    style={{ right: logoOpen / 2 }}
                  />
                  {left.map((a, i) => (
                    <Panel
                      key={a.id}
                      action={a}
                      width={panel}
                      open={open}
                      musicRef={musicRef}
                      bleedRight={i === left.length - 1 ? logoOpen / 2 + 2 : 0}
                    />
                  ))}
                </div>
              </div>
              <div
                className="absolute inset-y-0 right-0"
                style={{
                  left: `calc(50% + ${shift}px)`,
                  clipPath: "inset(-100% -100% -100% 0)",
                }}
              >
                <div
                  className="menu-bar-slide relative flex h-full justify-start"
                  data-side="right"
                  data-open={open}
                  style={{ paddingLeft: logoOpen / 2 }}
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-ink-800/90 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-sm"
                    style={{ left: logoOpen / 2 }}
                  />
                  {right.map((a, i) => (
                    <Panel
                      key={a.id}
                      action={a}
                      width={panel}
                      open={open}
                      musicRef={musicRef}
                      bleedLeft={i === 0 ? logoOpen / 2 + 2 : 0}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`absolute inset-x-0 z-20 flex justify-center px-3 transition-all duration-[var(--motion-enter)] ease-[var(--ease-emphasized)] ${
              open
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0"
            }`}
            style={{ top: `calc(${menuCenter} + ${Math.round(logoClosed / 2) + 22}px)` }}
          >
            <div
              ref={stackedRef}
              data-menu-guard=""
              className="flex max-w-full flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-ink-800/90 p-2 backdrop-blur-md"
            >
              {[...left, ...right].map((a) => (
                <StackedAction key={a.id} action={a} open={open} musicRef={musicRef} />
              ))}
            </div>
          </div>
        )}

        <span
          aria-hidden
          data-menu-guard=""
          className="pointer-events-none absolute left-1/2"
          style={{
            top: menuCenter,
            width: logoSize * (lowSpec ? 1 : 1 + RING_RATIO * 2),
            height: logoSize * (lowSpec ? 1 : 1 + RING_RATIO * 2),
            transform: `translate(-50%, -50%) translateX(${
              open && wide ? shift : 0
            }px)`,
          }}
        />

        {/* Only the round logo takes the pointer. The button and its square
            wrappers let it through, so hover, clicks and the beat hitsounds
            begin at the circle's edge rather than its bounding box. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onPointerEnter={(e) => setLogoHovered(e.pointerType !== "touch")}
          onPointerLeave={() => setLogoHovered(false)}
          aria-label={t("menu.open")}
          aria-expanded={open}
          className="group pointer-events-none absolute left-1/2 top-1/2 z-20 outline-none transition-transform duration-[var(--motion-enter)] ease-[var(--ease-emphasized)]"
          style={{
            width: logoClosed,
            height: logoClosed,
            top: menuCenter,
            transform: `translate(-50%, -50%) translateX(${
              open && wide ? shift : 0
            }px) scale(${logoSize / logoClosed})`,
          }}
        >
          <div className="start-logo-hover relative h-full w-full">
            {!lowSpec && (
              <span aria-hidden className="start-logo-shockwaves absolute inset-0 rounded-full">
                <span />
                <span />
                <span />
              </span>
            )}
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
                className="pointer-events-auto relative h-full w-full cursor-pointer select-none rounded-full shadow-[0_20px_80px_rgba(232,104,104,0.3)] ring-1 ring-white/10 transition-[filter] duration-200 group-hover:brightness-110"
              />
            </div>
          </div>
        </button>

        {/* Stays put when the osu! banner slides in; the banner layers above
            it on a window narrow enough for the two to meet. */}
        <div
          data-menu-guard=""
          className="menu-legible absolute bottom-3 right-4 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-300"
        >
          <span>Cascade · v{__APP_VERSION__}</span>
          <span aria-hidden>·</span>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer"
            aria-label={t("startModal.joinDiscord")}
            title={t("startModal.joinDiscord")}
            className="transition hover:text-[#5865F2]"
          >
            <DiscordIcon className="block h-3.5 w-3.5" />
          </a>
          <span aria-hidden>·</span>
          <a
            href={siteUrl("terms")}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-white"
          >
            {t("settings.terms")}
          </a>
          <span aria-hidden>·</span>
          <a
            href={siteUrl("privacy")}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-white"
          >
            {t("startModal.privacyPolicy")}
          </a>
        </div>
      </div>

      {children}
    </div>
  );
}

// Tips turn up now and then rather than sitting there: the first a little
// while after the menu opens, then one every so often, each for a while.
const TIP_FIRST_MS: [number, number] = [15000, 30000];
const TIP_GAP_MS: [number, number] = [90000, 180000];
const TIP_SHOW_MS = 10000;

const between = ([min, max]: [number, number]) =>
  min + Math.random() * (max - min);

type MenuTip = {
  text: MessageKey;
  /** Bound keys filled into the text as {a}, {b}, {c}, {d}. */
  keys?: EditorAction[];
  browserOnly?: boolean;
};

// Niche but handy things most people never stumble on.
const MENU_TIPS: MenuTip[] = [
  { text: "tips.slowMo", keys: ["slowMo"] },
  { text: "tips.zen", keys: ["zenMode"] },
  { text: "tips.desktop", browserOnly: true },
  { text: "tips.waveform", keys: ["waveformOverlay"] },
  { text: "tips.bookmarks", keys: ["addBookmark", "prevBookmark", "nextBookmark"] },
  { text: "tips.loop" },
  { text: "tips.timelineMenu" },
  { text: "tips.timelineWave" },
  { text: "tips.altWheel" },
  { text: "tips.clipboard" },
  {
    text: "tips.selection",
    keys: ["mirrorSelection", "reverseSelection", "scaleHalf", "scaleDouble"],
  },
  {
    text: "tips.hitsoundMode",
    keys: ["hitsoundMode", "whistleAdd", "finishAdd", "clapAdd"],
  },
  { text: "tips.snap", keys: ["snap1", "snap8", "snapFree"] },
  { text: "tips.tapTempo" },
  { text: "tips.menuMusic" },
  { text: "tips.logoBeat" },
  { text: "tips.playtest", keys: ["playtestToggle"] },
  { text: "tips.palette" },
];

/** A "Did you know?" note near the bottom of the open menu. It turns up
 *  only now and then, a different tip each time, and fades away again. */
function MenuTips({
  active,
  keybinds,
}: {
  active: boolean;
  keybinds: EditorKeybinds;
}) {
  const t = useT();
  const [tips] = useState(() =>
    MENU_TIPS.filter((tip) => !tip.browserOnly || !isDesktopApp()),
  );
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * tips.length),
  );
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
    if (!active) return;
    let timer = 0;
    const wait = (range: [number, number]) => {
      timer = window.setTimeout(() => {
        setIndex((i) =>
          tips.length > 1
            ? (i + 1 + Math.floor(Math.random() * (tips.length - 1))) % tips.length
            : i,
        );
        setShown(true);
        timer = window.setTimeout(() => {
          setShown(false);
          wait(TIP_GAP_MS);
        }, TIP_SHOW_MS);
      }, between(range));
    };
    wait(TIP_FIRST_MS);
    return () => window.clearTimeout(timer);
  }, [active, tips.length]);

  const visible = active && shown;
  const tip = tips[index];
  const params: Record<string, string> = {};
  tip.keys?.forEach((action, i) => {
    params["abcd"[i]] = editorKeyLabel(keybinds[action]);
  });

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none absolute inset-x-0 bottom-[max(3rem,8vh)] z-10 flex justify-center px-6 transition-all duration-500 ease-[var(--ease-standard)] ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div
        data-menu-guard=""
        className="flex w-[min(34rem,100%)] items-start gap-3 rounded-xl bg-ink-700 px-4 py-3"
      >
        <BulbIcon />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            {t("tips.didYouKnow")}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-slate-100">
            {t(tip.text, params)}
          </p>
        </div>
      </div>
    </div>
  );
}

function BulbIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"
    >
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
    </svg>
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
      Math.round(wide ? Math.min(vw * 0.46, vh * 0.64) : Math.min(vw * 0.68, vh * 0.44)),
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

const HOVER_FALLBACK_MS = 300;

type MusicRef = { readonly current: MenuMusic };

function BeatIcon({
  musicRef,
  hovered,
  children,
}: {
  musicRef: MusicRef;
  hovered: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const bounceRef = useRef<BeatBounce | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || reduceMotion() || (!hovered && !bounceRef.current)) return;
    const bounce = (bounceRef.current ??= new BeatBounce());
    const start = performance.now();
    const clock = hovered ? beatClock(musicRef.current, start) : null;
    let lastBeat = clock?.index ?? null;
    if (hovered) bounce.hover(start, clock ? clock.length - clock.phase : HOVER_FALLBACK_MS, beatIntensity(musicRef.current, start, clock?.length ?? HOVER_FALLBACK_MS));
    else bounce.leave(start);
    let raf = 0;
    const tick = (time: number) => {
      if (hovered) {
        const beat = beatClock(musicRef.current, time);
        if (beat && beat.index !== lastBeat) {
          if (lastBeat !== null) bounce.beat(time - beat.phase, beat.length, beatIntensity(musicRef.current, time, beat.length), time);
          lastBeat = beat.index;
        }
      }
      node.style.transform = bounceTransform(bounce.frame(time));
      if (hovered || !bounce.settled(time)) raf = requestAnimationFrame(tick);
      else node.style.removeProperty("transform");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hovered, musicRef]);

  return (
    <span ref={ref} className="inline-flex">
      {children}
    </span>
  );
}

function Panel({
  action,
  width,
  open,
  musicRef,
  bleedLeft = 0,
  bleedRight = 0,
}: {
  action: MenuAction;
  width: number;
  open: boolean;
  musicRef: MusicRef;
  bleedLeft?: number;
  bleedRight?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      onClick={action.onClick}
      onPointerEnter={(e) => setHovered(e.pointerType !== "touch")}
      onPointerLeave={() => setHovered(false)}
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
        <span className="menu-panel-icon inline-flex">
          <BeatIcon musicRef={musicRef} hovered={hovered && open}>
            {action.icon}
          </BeatIcon>
        </span>
        <span className="text-[13px] font-semibold tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
          {action.label}
        </span>
      </span>
    </button>
  );
}

function StackedAction({
  action,
  open,
  musicRef,
}: {
  action: MenuAction;
  open: boolean;
  musicRef: MusicRef;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      onClick={action.onClick}
      onPointerEnter={(e) => setHovered(e.pointerType !== "touch")}
      onPointerLeave={() => setHovered(false)}
      className="group flex w-[104px] flex-col items-center gap-2 rounded-xl px-2 py-3 text-center transition hover:bg-white/5"
    >
      <span
        className="grid h-12 w-12 place-items-center rounded-xl text-white transition group-hover:brightness-125"
        style={{ background: action.color }}
      >
        <BeatIcon musicRef={musicRef} hovered={hovered && open}>
          {action.icon}
        </BeatIcon>
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
}: {
  url: string | null;
  players: OnlinePlayer[];
  phone: boolean;
  open: boolean;
}) {
  const [layers, setLayers] = useState<
    { id: number; url: string; leaving: boolean }[]
  >([]);
  const nextId = useRef(0);
  const parallaxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = parallaxRef.current;
    if (!node) return;
    if (reduceMotion()) return;

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

  // Each picture keeps its own fade: a new one fades in over whatever is
  // still showing, and nothing restarts or vanishes mid-fade however quickly
  // songs change.
  useEffect(() => {
    if (!url) {
      setLayers((prev) =>
        prev.some((layer) => !layer.leaving)
          ? prev.map((layer) => ({ ...layer, leaving: true }))
          : prev,
      );
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      setLayers((prev) => [
        ...prev.slice(-(BG_MAX_LAYERS - 1)),
        { id: nextId.current++, url, leaving: false },
      ]);
    };
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [url]);

  // Once the newest layer has finished fading, everything under it goes.
  useEffect(() => {
    if (layers.length <= 1 && !layers.some((layer) => layer.leaving)) return;
    const id = window.setTimeout(() => {
      setLayers((prev) => {
        const top = prev[prev.length - 1];
        return top && !top.leaving ? [top] : [];
      });
    }, BG_FADE_MS);
    return () => window.clearTimeout(id);
  }, [layers]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={parallaxRef} className="absolute inset-0 will-change-transform">
        {/* Leans in while the logo stands alone and eases back out as the
            menu opens; kept apart from the parallax transform above. */}
        <div
          className="absolute inset-0 transition-transform duration-[600ms] ease-[var(--ease-emphasized)] motion-reduce:transition-none"
          style={{ transform: `scale(${!open && !phone ? BG_CLOSED_ZOOM : 1})` }}
        >
          {/* Sharp across the middle; a blurred copy on top is masked in
              only toward the edges, like a vignette. */}
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`absolute inset-0 ${
                layer.leaving ? "bg-fade-out" : "bg-fade-in"
              }`}
            >
              <img
                src={layer.url}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover"
              />
              <img
                src={layer.url}
                alt=""
                aria-hidden
                className="menu-bg-vignette absolute inset-0 h-full w-full scale-110 object-cover blur-[3px]"
              />
            </div>
          ))}
        </div>
      </div>
      {open && (
        <FloatingPlayers players={players} phone={phone} />
      )}
    </div>
  );
}

const FLOAT_MAX_COUNT = 4;
// Faces swap in and out of the background layer on a gentle rhythm so the
// menu never shows the same cast twice in a row.
const FLOAT_ROTATE_MS = 9_000;
const FLOAT_SETTLE_MS = 140;

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const [shown, setShown] = useState<OnlinePlayer[]>([]);
  const [slots, setSlots] = useState<Map<string, AvatarSlot>>(() => new Map());
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
      setShown((prev) => [...prev.filter((p) => p.id !== out.id), add]);
    };
    const id = window.setInterval(swap, FLOAT_ROTATE_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, limit]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    setSlots((prev) => {
      const next = new Map<string, AvatarSlot>();
      let changed = false;
      for (const [id, slot] of prev) {
        if (shown.some((p) => p.id === id)) next.set(id, slot);
        else changed = true;
      }
      const missing = shown.filter((p) => !next.has(p.id));
      if (missing.length > 0) {
        const guards = guardRects(root);
        const area = placementArea(root);
        for (const player of missing) {
          const slot = makeSlot(phone, area, guards, [...next.values()]);
          if (!slot) continue;
          next.set(player.id, slot);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [shown, phone]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const check = () => {
      const guards = guardRects(root);
      const area = placementArea(root);
      const size = { width: root.clientWidth, height: root.clientHeight };
      const last = sizeRef.current;
      sizeRef.current = size;
      const scaleX = last && last.width > 0 ? size.width / last.width : 1;
      const scaleY = last && last.height > 0 ? size.height / last.height : 1;
      setSlots((prev) => {
        const next = new Map(prev);
        let changed = scaleX !== 1 || scaleY !== 1;
        if (changed) {
          for (const [id, slot] of prev) {
            next.set(id, rescaleSlot(slot, scaleX, scaleY, area));
          }
        }
        for (const [id, slot] of [...next]) {
          if (slotClear(slot, area, guards)) continue;
          changed = true;
          const boxes = slotBoxes(slot);
          if (
            boxClear(boxes.travel, area, guards) &&
            boxClear(slot.tipAbove ? boxes.below : boxes.above, area, guards)
          ) {
            next.set(id, { ...slot, tipAbove: !slot.tipAbove });
            continue;
          }
          next.delete(id);
          const moved = makeSlot(phone, area, guards, [...next.values()], {
            x: slot.x,
            y: slot.y,
          });
          if (moved) next.set(id, moved);
        }
        return changed ? next : prev;
      });
    };
    const schedule = () => {
      window.clearTimeout(frame);
      frame = window.setTimeout(check, FLOAT_SETTLE_MS);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const scope = root.parentElement?.parentElement ?? root;
    const mutations = new MutationObserver(schedule);
    mutations.observe(scope, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [phone]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[25] overflow-hidden"
    >
      {shown.slice(0, limit).map((p, i) => {
        const slot = slots.get(p.id);
        if (!slot) return null;
        const online = p.online;
        const color = online ? "#3fdc8c" : "#78818f";
        const lastSeen = online ? null : formatLastSeen(p.lastSeen, t);
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
            className="float-player-in group absolute pointer-events-auto transition-[left,top] duration-700 ease-out"
            style={
              {
                left: slot.x,
                top: slot.y,
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
                slot.tipAbove ? "bottom-full mb-1.5" : "top-full mt-1.5"
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

type BeatClock = MenuBeat & {
  /** False on the idle grid, when no track is playing. */
  synced: boolean;
  kiai: boolean;
};

/**
 * The menu's beat the way osu!'s BeatSyncedContainer reads it: the mapper's
 * timing point in effect at the (optionally early) track position, or an
 * idle grid on the wall clock when nothing is playing.
 */
function beatClock(music: MenuMusic, now: number, earlyMs = 0): BeatClock {
  const { track } = music;
  const playback = music.getPlayback();
  if (playback?.playing && track) {
    const position = playback.position + earlyMs;
    const beat = beatAt(track.timing, position);
    if (beat) {
      const kiai = track.kiai.some(
        (range) => position >= range.start && position < range.end,
      );
      return { ...beat, synced: true, kiai };
    }
  }
  return { ...idleBeat(now + earlyMs, IDLE_BPM), synced: false, kiai: false };
}

function beatPulse(music: MenuMusic, now: number): number {
  const clock = beatClock(music, now);
  return Math.pow(1 - clock.phase / clock.length, 5);
}

function beatIntensity(music: MenuMusic, now: number, windowMs: number): number {
  menuLoudness.update(music.track?.id ?? null, music.readLevels(), now);
  const playback = music.getPlayback();
  const kiai =
    !!playback?.playing &&
    !!music.track?.kiai.some((range) => playback.position >= range.start && playback.position < range.end);
  return menuLoudness.intensity(now, windowMs) * (kiai ? KIAI_BOOST : 1);
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

/**
 * Beat flashes down both edges, after osu!lazer's MenuSideFlashes, plus a
 * burst of stars when a kiai section starts.
 */
function SideFlashes({ music }: { music: MenuMusic }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const spriteRef = useRef<HTMLCanvasElement | null>(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const active = music.isPlaying;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!canvas || !left || !right) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (reduceMotion()) return;

    if (!spriteRef.current) spriteRef.current = makeStarSprite();
    const sprite = spriteRef.current;

    let width = 1;
    let height = 1;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = renderScale(2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const stars: Star[] = [];
    const leftFlash = new SideFlash();
    const rightFlash = new SideFlash();
    let lastBeat: string | null = null;
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
      spawn(opening);
    };

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const delta = last ? Math.min(64, time - last) : 16;
      last = time;

      const current = musicRef.current;
      // Read FLASH_FADE_IN_MS ahead and backdated to the moment that early
      // clock crossed the beat, so each fade-in completes on the beat itself.
      const clock = beatClock(current, time, FLASH_FADE_IN_MS);
      const inKiai = clock.synced && clock.kiai;

      if (inKiai && !wasKiai) fire();
      wasKiai = inKiai;

      const beatKey = clock.synced ? `${clock.point}:${clock.index}` : null;
      if (beatKey !== null && beatKey !== lastBeat) {
        const sides = flashSides(clock.index, clock.meter, clock.kiai);
        if (sides.left || sides.right) {
          const amps = current.readAmplitudes();
          const start = time - clock.phase;
          if (sides.left)
            leftFlash.trigger(time, start, flashPeak(amps?.left ?? 0, clock.kiai), clock.length);
          if (sides.right)
            rightFlash.trigger(time, start, flashPeak(amps?.right ?? 0, clock.kiai), clock.length);
        }
      }
      lastBeat = beatKey;

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

      left.style.opacity = leftFlash.value(time).toFixed(3);
      right.style.opacity = rightFlash.value(time).toFixed(3);

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
        className="menu-side-flash absolute inset-y-0 left-0 w-[min(26vh,30vw)] opacity-0"
        style={{ backgroundImage: SIDE_FLASH_LEFT }}
      />
      <div
        ref={rightRef}
        className="menu-side-flash absolute inset-y-0 right-0 w-[min(26vh,30vw)] opacity-0"
        style={{ backgroundImage: SIDE_FLASH_RIGHT }}
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
  const ampsRef = useRef(new Float32Array(VIS_BARS));
  const musicRef = useRef(music);
  musicRef.current = music;
  const lowSpec = usePerformanceMode();
  const reduced = useReducedMotion();
  const pad = Math.round(size * RING_RATIO);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const box = size + pad * 2;
    const dpr = renderScale(2);
    canvas.width = box * dpr;
    canvas.height = box * dpr;
    ctx.scale(dpr, dpr);

    const radius = size / 2 - 2;
    const maxLen = pad * 0.96;
    const centre = box / 2;
    const node = pulseRef.current;
    const punch = new AudioPunch();
    const spring = new CriticalSpring(1, LOGO_SPRING);
    // Bars as wide as the chord they stand on, so neighbours meet edge to
    // edge; each round repeats the ring turned by a fifth, and the additive
    // strokes brighten wherever loud bars stack.
    const barStep = (Math.PI * 2) / VIS_BARS;
    const barWidth = 2 * radius * Math.sin(barStep / 2);
    const cosTable = new Float32Array(VIS_BARS * VIS_ROUNDS);
    const sinTable = new Float32Array(VIS_BARS * VIS_ROUNDS);
    for (let j = 0; j < VIS_ROUNDS; j++) {
      for (let i = 0; i < VIS_BARS; i++) {
        const angle = i * barStep + (j * Math.PI * 2) / VIS_ROUNDS;
        cosTable[j * VIS_BARS + i] = Math.cos(angle);
        sinTable[j * VIS_BARS + i] = Math.sin(angle);
      }
    }
    const temporal = new Float32Array(VIS_BARS);
    let indexOffset = 0;
    let sinceUpdate = VIS_UPDATE_MS;
    let last = 0;
    let raf = 0;

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const delta = last ? Math.min(64, time - last) : 16;
      last = time;
      ctx.clearRect(0, 0, box, box);

      const current = musicRef.current;
      const amps = ampsRef.current;
      menuLoudness.update(current.track?.id ?? null, current.readLevels(), time);

      sinceUpdate += delta;
      if (sinceUpdate >= VIS_UPDATE_MS) {
        sinceUpdate %= VIS_UPDATE_MS;
        const spectrum = current.readSpectrum();
        if (spectrum) {
          const kiai = beatClock(current, time).kiai ? 1 : 0.5;
          for (let i = 0; i < VIS_BARS; i++) {
            const db = spectrum[i];
            temporal[i] = Number.isFinite(db)
              ? Math.min(1, 10 ** (db / 20) * VIS_MAGNITUDE_GAIN)
              : 0;
          }
          for (let i = 0; i < VIS_BARS; i++) {
            const target = temporal[(i + indexOffset) % VIS_BARS] * kiai;
            if (target > amps[i]) amps[i] = target;
          }
          indexOffset = (indexOffset + VIS_INDEX_CHANGE) % VIS_BARS;
        }
      }

      // The extra 0.03 keeps short bars from lingering near the ring.
      const decay = delta * VIS_DECAY_PER_MS;
      for (let i = 0; i < VIS_BARS; i++) {
        amps[i] -= decay * (amps[i] + 0.03);
        if (amps[i] < 0) amps[i] = 0;
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "butt";
      ctx.lineWidth = barWidth;
      ctx.strokeStyle = VIS_STROKE;
      for (let j = 0; j < VIS_ROUNDS; j++) {
        ctx.beginPath();
        for (let i = 0; i < VIS_BARS; i++) {
          const amp = amps[i];
          if (amp < VIS_DEAD_ZONE) continue;
          const k = j * VIS_BARS + i;
          const len = Math.min(maxLen, amp * VIS_BAR_LENGTH * size);
          const x = cosTable[k];
          const y = sinTable[k];
          ctx.moveTo(centre + x * radius, centre + y * radius);
          ctx.lineTo(centre + x * (radius + len), centre + y * (radius + len));
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      if (node) {
        const current = musicRef.current;
        const clock = beatClock(current, time);
        const grid = beatShape(clock.phase, clock.length);
        const transients = clock.synced ? current.readTransients() : null;
        const hit = punch.update(current.track?.id ?? null, transients, time);
        let target = 1 + grid * LOGO_IDLE_DEPTH;
        if (transients) {
          const amps = current.readAmplitudes();
          const peak = amps ? Math.max(amps.left, amps.right) : 0;
          const level = Math.max(
            0,
            (peak - LOGO_LEVEL_FLOOR) / (1 - LOGO_LEVEL_FLOOR),
          );
          target =
            1 +
            hit * LOGO_PUNCH_DEPTH * (1 + LOGO_BEAT_ACCENT * grid) +
            level * LOGO_LEVEL_DEPTH +
            grid * LOGO_GRID_DEPTH;
        }
        node.style.transform = `scale(${spring.step(target, delta).toFixed(4)})`;
      }
    };

    if (!reduced) raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      if (node) node.style.transform = "";
    };
  }, [size, pad, pulseRef, lowSpec, reduced]);

  if (lowSpec) return null;
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
