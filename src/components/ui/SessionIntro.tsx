import { useCallback, useEffect, useState } from "react";

const SESSION_KEY = "cascade:intro:shown";
const INTRO_MS = 2100;
// Never hold the curtain longer than this waiting on `ready`.
const MAX_INTRO_MS = 6000;

function shouldShow(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

/**
 * `ready` reports that the menus' code has finished loading; the intro plays
 * at least INTRO_MS and then waits for it, so the first modal opens instantly.
 */
export function SessionIntro({
  enabled,
  musicPlaying,
  ready,
}: {
  enabled: boolean;
  musicPlaying: boolean;
  ready: boolean;
}) {
  const [visible, setVisible] = useState(() => enabled && shouldShow());
  const [leaving, setLeaving] = useState(false);
  const [started, setStarted] = useState(musicPlaying);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (!enabled) setVisible(false);
  }, [enabled]);

  const finish = useCallback(() => {
    if (!visible || leaving) return;
    setLeaving(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // A private browsing context may not expose session storage.
    }
    window.setTimeout(() => setVisible(false), 420);
  }, [leaving, visible]);

  useEffect(() => {
    if (!visible || started) return;
    if (musicPlaying) {
      setStarted(true);
      return;
    }
    // Browsers may hold the first track until a user gesture. Do not leave a
    // blank curtain up indefinitely in that case.
    const fallback = window.setTimeout(() => setStarted(true), 450);
    return () => window.clearTimeout(fallback);
  }, [musicPlaying, started, visible]);

  useEffect(() => {
    if (!visible || !started) return;
    const timer = window.setTimeout(() => setPlayed(true), INTRO_MS);
    const cap = window.setTimeout(finish, MAX_INTRO_MS);
    const onKey = () => finish();
    window.addEventListener("keydown", onKey, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(cap);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish, started, visible]);

  useEffect(() => {
    if (played && ready) finish();
  }, [finish, played, ready]);

  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={finish}
      data-playing={musicPlaying ? "true" : "false"}
      className={`session-intro fixed inset-0 z-[500] grid cursor-pointer place-items-center overflow-hidden bg-ink-900 text-white ${
        started ? "is-started" : ""
      } ${
        leaving ? "is-leaving" : ""
      }`}
      aria-label="Skip Cascade intro"
    >
      <span aria-hidden className="session-intro-ring" />
      <span className="session-intro-lockup relative flex flex-col items-center">
        <img
          src={`${import.meta.env.BASE_URL}logo.png?v=3`}
          alt=""
          draggable={false}
          className="session-intro-logo h-36 w-36 select-none rounded-full"
        />
        <span className="session-intro-word mt-5 text-3xl font-bold tracking-tight">Cascade</span>
        <span className="session-intro-sub mt-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-accent">VSRG Editor</span>
      </span>
      <span className="absolute bottom-6 text-[10px] uppercase tracking-[0.22em] text-white/30">click or press a key to skip</span>
    </button>
  );
}
