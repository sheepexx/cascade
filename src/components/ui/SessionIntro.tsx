import { useCallback, useEffect, useState } from "react";

const SESSION_KEY = "cascade:intro:shown";
const INTRO_MS = 2100;

function shouldShow(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

export function SessionIntro({ enabled, musicPlaying }: { enabled: boolean; musicPlaying: boolean }) {
  const [visible, setVisible] = useState(() => enabled && shouldShow());
  const [leaving, setLeaving] = useState(false);
  const [started, setStarted] = useState(musicPlaying);

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
    const timer = window.setTimeout(finish, INTRO_MS);
    const onKey = () => finish();
    window.addEventListener("keydown", onKey, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish, started, visible]);

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
