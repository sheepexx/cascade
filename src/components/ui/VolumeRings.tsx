import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MOTION } from "../../lib/motion";

export type VolumeMeter = "effects" | "master" | "music";

const METERS: { id: VolumeMeter; label: string }[] = [
  { id: "effects", label: "Effects" },
  { id: "master", label: "Master" },
  { id: "music", label: "Music" },
];

const VISIBLE_MS = 1100;

function Ring({
  id,
  label,
  value,
  active,
  onHover,
}: {
  id: VolumeMeter;
  label: string;
  value: number;
  active: boolean;
  onHover: (meter: VolumeMeter) => void;
}) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      data-meter={id}
      onPointerEnter={() => onHover(id)}
      className={`volume-ring-row flex items-center ${active ? "is-active" : ""}`}
    >
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

/**
 * Alt+wheel volume HUD. Alt+wheel adjusts the active meter (Master unless a
 * ring was hovered); while the HUD is up, hovering a ring makes it active and
 * scrolling over it adjusts that ring, Alt or not.
 */
export function VolumeRings({
  changeKey,
  values,
  active,
  onActive,
  onAdjust,
  onHide,
}: {
  changeKey: number;
  values: Record<VolumeMeter, number>;
  active: VolumeMeter;
  onActive: (meter: VolumeMeter) => void;
  onAdjust: (meter: VolumeMeter, deltaY: number) => void;
  /** Fires once the HUD has faded out. */
  onHide?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onAdjustRef = useRef(onAdjust);
  onAdjustRef.current = onAdjust;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (changeKey <= 0) return;
    setVisible(true);
    setClosing(false);
  }, [changeKey]);

  // The countdown restarts on every change and holds while the pointer is
  // over the rings, so a ring being adjusted never fades out underneath it.
  useEffect(() => {
    if (!visible || hovered) return;
    const close = window.setTimeout(() => setClosing(true), VISIBLE_MS);
    const unmount = window.setTimeout(() => {
      setVisible(false);
      onHideRef.current?.();
    }, VISIBLE_MS + MOTION.exit);
    return () => {
      window.clearTimeout(close);
      window.clearTimeout(unmount);
    };
  }, [changeKey, hovered, visible]);

  useEffect(() => {
    const el = containerRef.current;
    if (!visible || !el) return;
    // Native and non-passive: React's wheel listener cannot preventDefault,
    // and stopping propagation keeps the window Alt+wheel handler from
    // applying the same notch a second time.
    const onWheel = (event: WheelEvent) => {
      const row = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-meter]",
      );
      const meter = row?.dataset.meter as VolumeMeter | undefined;
      if (!meter) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY !== 0) onAdjustRef.current(meter, event.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [visible]);

  useEffect(() => {
    if (!visible) setHovered(false);
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      ref={containerRef}
      role="status"
      aria-live="polite"
      aria-label={`${METERS.find((meter) => meter.id === active)?.label ?? "Master"} volume ${Math.round(
        values[active] * 100,
      )} percent`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`volume-rings fixed right-7 top-1/2 z-[180] flex -translate-y-1/2 flex-col gap-2 ${
        closing ? "is-closing" : ""
      }`}
    >
      {METERS.map((meter) => (
        <Ring
          key={meter.id}
          id={meter.id}
          label={meter.label}
          value={values[meter.id]}
          active={meter.id === active}
          onHover={onActive}
        />
      ))}
    </div>
  );
}
