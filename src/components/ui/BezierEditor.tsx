import { useCallback, useRef, useState } from "react";
import type { BezierHandles } from "../../lib/sv";

// Drag-to-shape easing editor, the same idea as the cubic-bezier widgets in
// motion apps: the curve runs corner to corner and the two control points are
// draggable. X is clamped to the unit square so the curve stays a function of
// progress; Y may overshoot, which is what gives elastic-looking SV.

const Y_MIN = -0.45;
const Y_MAX = 1.45;
const PAD = 14;
const SIZE = 100;

type Props = {
  value: BezierHandles;
  onChange: (value: BezierHandles) => void;
  disabled?: boolean;
};

export function BezierEditor({ value, onChange, disabled }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<1 | 2 | null>(null);

  // Unit space (0-1 x, Y_MIN-Y_MAX y) to view space, y flipped.
  const vx = (x: number) => PAD + x * SIZE;
  const vy = (y: number) =>
    PAD + SIZE - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * SIZE;

  const fromEvent = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    // The viewBox is square, so one scale factor covers both axes.
    const scale = (SIZE + PAD * 2) / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const x = (px - PAD) / SIZE;
    const y = Y_MIN + ((PAD + SIZE - py) / SIZE) * (Y_MAX - Y_MIN);
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(Y_MIN, Math.min(Y_MAX, y)),
    };
  }, []);

  const onPointerDown = (handle: 1 | 2) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(handle);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || disabled) return;
    const p = fromEvent(e);
    if (!p) return;
    onChange(
      dragging === 1
        ? { ...value, x1: p.x, y1: p.y }
        : { ...value, x2: p.x, y2: p.y },
    );
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Capture may already be gone if the pointer left the window.
    }
    setDragging(null);
  };

  // Arrow keys nudge the focused handle, so the curve is reachable without a
  // pointer.
  const onKeyDown = (handle: 1 | 2) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    const dx =
      e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowDown" ? -step : e.key === "ArrowUp" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    const x = handle === 1 ? value.x1 : value.x2;
    const y = handle === 1 ? value.y1 : value.y2;
    const next = {
      x: Math.max(0, Math.min(1, x + dx)),
      y: Math.max(Y_MIN, Math.min(Y_MAX, y + dy)),
    };
    onChange(
      handle === 1
        ? { ...value, x1: next.x, y1: next.y }
        : { ...value, x2: next.x, y2: next.y },
    );
  };

  const p0 = { x: vx(0), y: vy(0) };
  const p3 = { x: vx(1), y: vy(1) };
  const c1 = { x: vx(value.x1), y: vy(value.y1) };
  const c2 = { x: vx(value.x2), y: vy(value.y2) };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE + PAD * 2} ${SIZE + PAD * 2}`}
      className={`h-[150px] w-full touch-none select-none rounded-lg border border-ink-500/60 bg-ink-800/60 ${
        disabled ? "opacity-50" : ""
      }`}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="group"
      aria-label="Easing curve editor"
    >
      {/* Unit square and the straight-line reference. */}
      <rect
        x={PAD}
        y={vy(1)}
        width={SIZE}
        height={vy(0) - vy(1)}
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(148,163,184,0.18)"
        strokeWidth={0.6}
      />
      <line
        x1={p0.x}
        y1={p0.y}
        x2={p3.x}
        y2={p3.y}
        stroke="rgba(148,163,184,0.22)"
        strokeWidth={0.6}
        strokeDasharray="3 3"
      />

      {/* Handle arms. */}
      <line x1={p0.x} y1={p0.y} x2={c1.x} y2={c1.y} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
      <line x1={p3.x} y1={p3.y} x2={c2.x} y2={c2.y} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />

      <path
        d={`M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`}
        fill="none"
        stroke="rgb(45,212,191)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />

      <circle cx={p0.x} cy={p0.y} r={2} fill="rgba(148,163,184,0.7)" />
      <circle cx={p3.x} cy={p3.y} r={2} fill="rgba(148,163,184,0.7)" />

      {([1, 2] as const).map((handle) => {
        const c = handle === 1 ? c1 : c2;
        return (
          <circle
            key={handle}
            cx={c.x}
            cy={c.y}
            r={dragging === handle ? 5.5 : 4.5}
            fill="#fff"
            stroke="rgb(45,212,191)"
            strokeWidth={1.2}
            tabIndex={disabled ? -1 : 0}
            role="slider"
            aria-label={`Control point ${handle}`}
            aria-valuenow={Math.round(
              (handle === 1 ? value.y1 : value.y2) * 100,
            )}
            onPointerDown={onPointerDown(handle)}
            onKeyDown={onKeyDown(handle)}
            className={`outline-none ${
              disabled ? "" : "cursor-grab focus-visible:stroke-white"
            }`}
          />
        );
      })}
    </svg>
  );
}
