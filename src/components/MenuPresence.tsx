import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { OnlinePlayer } from "../hooks/useOnlinePresence";
import { OpenPlayerContext } from "./openPlayerContext";
import { POPOVER_CLASS } from "./ui/Menu";
import { useT, type Translate } from "../lib/i18n";
import { reduceMotion } from "../lib/performanceMode";

/** Faces previewed on the closed chip; the count covers the rest. */
const CHIP_FACES = 3;
/** Offline people listed under "Recently active", newest first. */
const RECENT_LIMIT = 6;
const HOVER_OPEN_MS = 80;
const HOVER_CLOSE_MS = 220;

type Expanded = "hover" | "pinned" | null;

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

const byName = (a: OnlinePlayer, b: OnlinePlayer) =>
  a.username.localeCompare(b.username, undefined, { sensitivity: "base" });

/**
 * Who else is around, docked in the menu's bottom-left corner opposite the
 * version line. Closed, it is a chip with a few faces and a count, its dot
 * ticking on the song's beat. Hovering or clicking it lists everyone online
 * and, dimmed below them, who was here recently.
 */
export function MenuPresence({
  players,
  visible,
  beat,
}: {
  players: OnlinePlayer[];
  /** The menu is open; the chip comes and goes with it. */
  visible: boolean;
  /** 0 to 1 on each beat of the playing song, 0 when nothing plays. */
  beat: (time: number) => number;
}) {
  const t = useT();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const hoverTimer = useRef(0);
  // A click that closes the list keeps the pointer resting on the chip from
  // opening it again until it leaves.
  const hoverBlocked = useRef(false);
  const [expanded, setExpanded] = useState<Expanded>(null);
  // The list plays its exit before it unmounts.
  const [panel, setPanel] = useState<"in" | "out" | null>(null);

  const online = players.filter((p) => p.online).sort(byName);
  const recent = players
    .filter((p) => !p.online)
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
    .slice(0, RECENT_LIMIT);
  const anyoneOnline = online.length > 0;
  const empty = players.length === 0;

  useEffect(() => {
    if (expanded) setPanel("in");
    else setPanel((current) => (current ? "out" : null));
  }, [expanded]);

  useEffect(() => {
    if (!visible || empty) setExpanded(null);
  }, [visible, empty]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [expanded]);

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot || !visible || !anyoneOnline || reduceMotion()) return;
    let raf = 0;
    let last = -1;
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      const value = Math.round(beat(time) * 100) / 100;
      if (value === last) return;
      last = value;
      dot.style.setProperty("--beat", String(value));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      dot.style.removeProperty("--beat");
    };
  }, [beat, visible, anyoneOnline]);

  if (empty) return null;

  const hover = (event: PointerEvent, entering: boolean) => {
    if (event.pointerType === "touch") return;
    window.clearTimeout(hoverTimer.current);
    if (!entering) hoverBlocked.current = false;
    if (entering && hoverBlocked.current) return;
    hoverTimer.current = window.setTimeout(
      () =>
        setExpanded((current) =>
          entering ? (current ?? "hover") : current === "hover" ? null : current,
        ),
      entering ? HOVER_OPEN_MS : HOVER_CLOSE_MS,
    );
  };

  // A click keeps a list that hovering opened, and closes one it pinned.
  const toggle = () => {
    window.clearTimeout(hoverTimer.current);
    if (expanded === "pinned") {
      hoverBlocked.current = true;
      setExpanded(null);
    } else {
      setExpanded("pinned");
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !expanded) return;
    // The menu closes on Escape too; this one only closes the list.
    event.stopPropagation();
    setExpanded(null);
    chipRef.current?.focus();
  };

  const faces = online.slice(0, CHIP_FACES);

  return (
    <div
      ref={rootRef}
      onPointerEnter={(e) => hover(e, true)}
      onPointerLeave={(e) => hover(e, false)}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        // Only when focus lands somewhere else; a click on the list's text
        // blurs to nothing, and the outside-press check covers real exits.
        const next = event.relatedTarget as Node | null;
        if (expanded && next && !rootRef.current?.contains(next)) setExpanded(null);
      }}
      className={`absolute bottom-3 left-4 transition-[opacity,transform] duration-[var(--motion-scene)] ease-[var(--ease-emphasized)] ${
        panel ? "z-30" : "z-10"
      } ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
      {...({ inert: visible ? undefined : "" } as { inert?: string })}
    >
      {panel && (
        <div
          id={panelId}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && panel === "out") setPanel(null);
          }}
          className={`absolute bottom-full left-0 mb-2 max-h-[min(26rem,calc(100vh-6rem))] w-[17.5rem] overflow-y-auto ${POPOVER_CLASS} ${
            panel === "in" ? "presence-pop-in" : "presence-pop-out"
          }`}
        >
          {anyoneOnline && (
            <PresenceSection
              title={t("social.online")}
              count={online.length}
              players={online}
              onDone={() => setExpanded(null)}
            />
          )}
          {recent.length > 0 && (
            <PresenceSection
              title={t("social.recentlyActive")}
              players={recent}
              divided={anyoneOnline}
              onDone={() => setExpanded(null)}
            />
          )}
        </div>
      )}

      <button
        ref={chipRef}
        type="button"
        onClick={toggle}
        aria-expanded={Boolean(expanded)}
        aria-controls={panel ? panelId : undefined}
        className={`flex h-8 items-center gap-2 rounded-full bg-ink-800/90 pr-3 text-xs font-semibold ring-1 ring-white/[0.08] backdrop-blur-sm transition-colors duration-[var(--motion-quick)] hover:bg-ink-700/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
          faces.length > 0 ? "pl-1" : "pl-3"
        } ${expanded ? "bg-ink-700/95" : ""}`}
      >
        {faces.length > 0 && (
          <span aria-hidden className="flex -space-x-1.5">
            {faces.map((p) => (
              <Face key={p.id} player={p} size={24} className="ring-2 ring-ink-800" />
            ))}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span
            ref={dotRef}
            aria-hidden
            className={`presence-dot h-1.5 w-1.5 rounded-full ${
              anyoneOnline ? "bg-emerald-400" : "bg-slate-500"
            }`}
          />
          <span className={anyoneOnline ? "text-slate-100" : "text-slate-400"}>
            {anyoneOnline
              ? t("menu.onlineCount", { n: online.length })
              : t("menu.nobodyOnline")}
          </span>
        </span>
      </button>
    </div>
  );
}

function PresenceSection({
  title,
  count,
  players,
  divided = false,
  onDone,
}: {
  title: string;
  count?: number;
  players: OnlinePlayer[];
  divided?: boolean;
  onDone: () => void;
}) {
  return (
    <section className={divided ? "mt-1 border-t border-white/[0.07] pt-1" : ""}>
      <h3 className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
        {count != null && <span className="tabular-nums text-slate-400">{count}</span>}
      </h3>
      <ul>
        {players.map((p) => (
          <PresenceRow key={p.id} player={p} onDone={onDone} />
        ))}
      </ul>
    </section>
  );
}

function PresenceRow({ player: p, onDone }: { player: OnlinePlayer; onDone: () => void }) {
  const t = useT();
  const actions = useContext(OpenPlayerContext);
  const cascade = actions != null && !p.id.startsWith("demo-");
  // An account without osu! may share its name with one that has it, and
  // names lead to the osu! one, so it is opened by its id.
  const profileName = p.osuId == null ? p.id : p.username;
  const href = cascade
    ? `/user/${encodeURIComponent(profileName)}`
    : p.osuId != null
      ? `https://osu.ppy.sh/users/${p.osuId}`
      : undefined;

  const detail = p.online
    ? p.status
      ? t("social.onlineMapping", { title: p.status })
      : t("social.online")
    : (() => {
        const seen = formatLastSeen(p.lastSeen, t);
        return seen ? t("menu.lastSeen", { time: seen }) : t("menu.offline");
      })();

  const openProfile = (event: MouseEvent) => {
    if (!cascade || !actions) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onDone();
    actions.openProfile(profileName);
  };

  const body = (
    <>
      <span className="relative shrink-0">
        <Face player={p} size={30} className={p.online ? "" : "opacity-55"} />
        {p.online && (
          <span
            aria-hidden
            className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-[1.5px] border-ink-700 bg-emerald-400"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-semibold ${
            p.online ? "text-slate-100" : "text-slate-400"
          }`}
        >
          {p.username}
        </span>
        <span
          className={`block truncate text-xs ${p.online ? "text-slate-400" : "text-slate-500"}`}
        >
          {detail}
        </span>
      </span>
    </>
  );

  const rowClass =
    "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left focus-visible:outline-none";

  return (
    <li className="flex items-center gap-1 rounded-md transition-colors duration-[var(--motion-quick)] hover:bg-white/[0.06] focus-within:bg-white/[0.06]">
      {href ? (
        <a
          href={href}
          target={cascade ? undefined : "_blank"}
          rel="noopener noreferrer"
          onClick={openProfile}
          title={t("social.viewProfileOf", { name: p.username })}
          className={rowClass}
        >
          {body}
        </a>
      ) : (
        <span className={rowClass}>{body}</span>
      )}
      {cascade && actions && (
        <button
          type="button"
          onClick={() => {
            onDone();
            actions.openMessages(p.id, profileName);
          }}
          aria-label={t("social.messageUser", { name: p.username })}
          title={t("social.messageUser", { name: p.username })}
          className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 transition-colors duration-[var(--motion-quick)] hover:bg-white/[0.08] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 18.5 4 20.5V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3H7.5ZM8 9.5h8M8 13h5"
            />
          </svg>
        </button>
      )}
    </li>
  );
}

/** An avatar, or the first letter of the name when there is none to show. */
function Face({
  player,
  size,
  className = "",
}: {
  player: OnlinePlayer;
  size: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (player.avatar && !failed) {
    return (
      <img
        src={player.avatar}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className={`block shrink-0 rounded-full bg-ink-700 object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-ink-600 font-display font-bold text-slate-200 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {player.username.slice(0, 1).toUpperCase()}
    </span>
  );
}
