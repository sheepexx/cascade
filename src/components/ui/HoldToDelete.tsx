import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onConfirm: () => void;
  className?: string;
  fillClassName?: string;
  durationMs?: number;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  children: React.ReactNode;
};

export function HoldToDelete({
  onConfirm,
  className = "",
  fillClassName = "bg-rose-500/45",
  durationMs = 750,
  disabled,
  title = "Hold to delete",
  "aria-label": ariaLabel,
  children,
}: Props) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  const begin = useCallback(() => {
    if (disabled || firedRef.current || rafRef.current != null) return;
    setHolding(true);
    startedRef.current = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedRef.current) / durationMs);
      setProgress(t);
      if (t >= 1) {
        rafRef.current = null;
        firedRef.current = true;
        setHolding(false);
        setProgress(0);
        onConfirm();
        window.setTimeout(() => {
          firedRef.current = false;
        }, 350);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, durationMs, onConfirm]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      data-no-uisound=""
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          void 0;
        }
        begin();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        cancel();
      }}
      onPointerCancel={cancel}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.repeat) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") cancel();
      }}
      className={`relative touch-none select-none overflow-hidden ${
        holding ? "hold-charging" : ""
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 ${fillClassName} ${
          holding ? "" : "transition-[width] duration-200 ease-out"
        }`}
        style={{ width: `${progress * 100}%` }}
      >
        {holding && (
          <span className="hold-shine absolute inset-y-0 right-0 w-[3px] bg-white shadow-[0_0_12px_3px_rgba(255,255,255,0.85)]" />
        )}
      </span>
      <span
        className={`relative z-10 flex items-center justify-center gap-1 ${
          holding ? "drop-shadow-[0_0_6px_rgba(0,0,0,0.55)]" : ""
        }`}
      >
        {children}
      </span>
    </button>
  );
}
