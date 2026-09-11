import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MOTION } from "../../lib/motion";

type Meter = { label: string; value: number; active?: boolean };

function Ring({ label, value, active }: Meter) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`volume-ring-row flex items-center ${active ? "is-active" : ""}`}>
      <div className="volume-ring-disc relative grid h-28 w-28 shrink-0 place-items-center rounded-full">
        <svg viewBox="0 0 112 112" aria-hidden className="absolute inset-0 h-full w-full">
          <circle cx="56" cy="56" r="45" pathLength="100" className="volume-ring-track" />
          <circle
            cx="56"
            cy="56"
            r="45"
            pathLength="100"
            className="volume-ring-value"
            style={{ "--ring-value": percent } as CSSProperties}
            transform="rotate(135 56 56)"
          />
        </svg>
        <span
          className={`relative flex flex-col items-center font-semibold tabular-nums text-white ${
            active ? "-translate-y-1 text-[1.7rem]" : "text-[1.65rem]"
          }`}
        >
          {percent}
          {active && (
            <span className="mt-1 grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white">
              <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5">
                <path d="M4 9.5v5h3.2L12 18.2V5.8L7.2 9.5H4Z" fill="currentColor" />
                <path d="M15 9a4.2 4.2 0 010 6M17.5 6.8a7.2 7.2 0 010 10.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </span>
      </div>
      <span className="volume-ring-label -ml-1 min-w-[7.75rem] rounded-full px-5 py-1.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-white">
        {label}
      </span>
    </div>
  );
}

export function VolumeRings({
  changeKey,
  master,
  music,
  effects,
}: {
  changeKey: number;
  master: number;
  music: number;
  effects: number;
}) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(0);

  useEffect(() => {
    if (changeKey <= 0) return;
    window.clearTimeout(timerRef.current);
    setVisible(true);
    setClosing(false);
    timerRef.current = window.setTimeout(() => setClosing(true), 1100);
    const unmount = window.setTimeout(() => setVisible(false), 1100 + MOTION.exit);
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(unmount);
    };
  }, [changeKey]);

  if (!visible) return null;
  const meters: Meter[] = [
    { label: "Effects", value: effects },
    { label: "Master", value: master, active: true },
    { label: "Music", value: music },
  ];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Master volume ${Math.round(master * 100)} percent`}
      className={`volume-rings fixed right-7 top-1/2 z-[180] flex -translate-y-1/2 flex-col gap-2 ${
        closing ? "is-closing" : ""
      }`}
    >
      {meters.map((meter) => <Ring key={meter.label} {...meter} />)}
    </div>
  );
}
