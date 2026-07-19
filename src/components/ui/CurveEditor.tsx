import { useCallback, useMemo, useRef } from "react";
import {
  clampCurveHandles,
  svCurveValueAt,
  type SvKeyframe,
} from "../../lib/sv";
import { MAX_SV, MIN_SV } from "../../types";

// After Effects style value graph: keyframes carry real SV values, each pair
// is joined by a cubic bezier, and the selected keyframe exposes its two
// handles. Only the selection shows handles, which keeps a busy curve legible.

const PAD_X = 16;
const PAD_Y = 14;
const W = 300;
const H = 132;

type DragState =
  | { kind: "kf" | "in" | "out"; index: number }
  | null;

type Props = {
  keyframes: SvKeyframe[];
  onChange: (kfs: SvKeyframe[]) => void;
  selected: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
};

export function CurveEditor({
  keyframes,
  onChange,
  selected,
  onSelect,
  disabled,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const curve = useMemo(() => clampCurveHandles(keyframes), [keyframes]);

  // Fit Y to whatever the curve actually reaches, including handle overshoot,
  // and always keep 1x on screen as the reference.
  const [loSv, hiSv] = useMemo(() => {
    let lo = 1;
    let hi = 1;
    for (let i = 0; i <= 60; i++) {
      const v = svCurveValueAt(curve, i / 60);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    for (const kf of curve) {
      lo = Math.min(lo, kf.sv, kf.sv + kf.in.y, kf.sv + kf.out.y);
      hi = Math.max(hi, kf.sv, kf.sv + kf.in.y, kf.sv + kf.out.y);
    }
    const pad = Math.max(0.15, (hi - lo) * 0.15);
    return [lo - pad, hi + pad];
  }, [curve]);

  const vx = useCallback((x: number) => PAD_X + x * W, []);
  const vy = useCallback(
    (sv: number) => PAD_Y + H - ((sv - loSv) / (hiSv - loSv || 1)) * H,
    [loSv, hiSv],
  );

  const fromEvent = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const sx = (W + PAD_X * 2) / rect.width;
      const sy = (H + PAD_Y * 2) / rect.height;
      const px = (e.clientX - rect.left) * sx - PAD_X;
      const py = (e.clientY - rect.top) * sy - PAD_Y;
      return {
        x: Math.max(0, Math.min(1, px / W)),
        sv: loSv + ((H - py) / H) * (hiSv - loSv),
      };
    },
    [loSv, hiSv],
  );

  const commit = (next: SvKeyframe[]) => onChange(clampCurveHandles(next));

  const onPointerDown =
    (kind: "kf" | "in" | "out", index: number) => (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { kind, index };
      onSelect(index);
    };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || disabled) return;
    const p = fromEvent(e);
    if (!p) return;
    const next = curve.map((kf) => ({ ...kf }));
    const kf = next[drag.index];
    if (!kf) return;

    if (drag.kind === "kf") {
      // The range endpoints stay pinned in time so the edited window keeps
      // its meaning; their value is still free.
      const isFirst = drag.index === 0;
      const isLast = drag.index === next.length - 1;
      if (!isFirst && !isLast) {
        const lo = next[drag.index - 1].x + 0.005;
        const hi = next[drag.index + 1].x - 0.005;
        kf.x = Math.max(lo, Math.min(hi, p.x));
      }
      kf.sv = Math.max(MIN_SV, Math.min(MAX_SV, p.sv));
    } else if (drag.kind === "out") {
      kf.out = { x: p.x - kf.x, y: p.sv - kf.sv };
    } else {
      kf.in = { x: p.x - kf.x, y: p.sv - kf.sv };
    }
    commit(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already have left the window.
    }
    dragRef.current = null;
  };

  /** Double-click inserts a keyframe on the curve without changing its shape. */
  const onDoubleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    const p = fromEvent(e);
    if (!p) return;
    if (p.x <= curve[0].x || p.x >= curve[curve.length - 1].x) return;
    const sv = svCurveValueAt(curve, p.x);
    const next = [...curve];
    const at = next.findIndex((kf) => kf.x > p.x);
    const index = at < 0 ? next.length - 1 : at;
    const gap = Math.min(p.x - next[index - 1].x, next[index].x - p.x) * 0.4;
    next.splice(index, 0, {
      x: p.x,
      sv,
      in: { x: -gap, y: 0 },
      out: { x: gap, y: 0 },
    });
    commit(next);
    onSelect(index);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const kf = curve[selected];
    if (!kf) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selected === 0 || selected === curve.length - 1) return;
      e.preventDefault();
      commit(curve.filter((_, i) => i !== selected));
      onSelect(Math.max(0, selected - 1));
      return;
    }
    const step = e.shiftKey ? 0.1 : 0.02;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy =
      (e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0) *
      (hiSv - loSv);
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    const next = curve.map((k) => ({ ...k }));
    const target = next[selected];
    const isEdge = selected === 0 || selected === next.length - 1;
    if (dx && !isEdge) {
      const lo = next[selected - 1].x + 0.005;
      const hi = next[selected + 1].x - 0.005;
      target.x = Math.max(lo, Math.min(hi, target.x + dx));
    }
    if (dy) {
      target.sv = Math.max(MIN_SV, Math.min(MAX_SV, target.sv + dy));
    }
    commit(next);
  };

  // One path per segment so each pair uses its own handles.
  const path = curve
    .slice(0, -1)
    .map((a, i) => {
      const b = curve[i + 1];
      return `M ${vx(a.x)} ${vy(a.sv)} C ${vx(a.x + a.out.x)} ${vy(
        a.sv + a.out.y,
      )}, ${vx(b.x + b.in.x)} ${vy(b.sv + b.in.y)}, ${vx(b.x)} ${vy(b.sv)}`;
    })
    .join(" ");

  const sel = curve[selected];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W + PAD_X * 2} ${H + PAD_Y * 2}`}
      className={`h-[150px] w-full touch-none select-none rounded-lg border border-ink-500/60 bg-ink-800/60 outline-none ${
        disabled ? "opacity-50" : ""
      }`}
      tabIndex={disabled ? -1 : 0}
      role="application"
      aria-label="SV curve editor. Drag keyframes, double-click to add, Delete to remove."
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      {/* 1x reference plus the plot frame. */}
      <rect
        x={PAD_X}
        y={PAD_Y}
        width={W}
        height={H}
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(148,163,184,0.18)"
        strokeWidth={0.6}
      />
      {loSv < 1 && hiSv > 1 && (
        <>
          <line
            x1={PAD_X}
            y1={vy(1)}
            x2={PAD_X + W}
            y2={vy(1)}
            stroke="rgba(148,163,184,0.35)"
            strokeWidth={0.6}
            strokeDasharray="3 3"
          />
          <text
            x={PAD_X + 3}
            y={vy(1) - 2}
            fontSize={7}
            fill="rgba(148,163,184,0.65)"
          >
            1×
          </text>
        </>
      )}

      <path d={path} fill="none" stroke="rgb(45,212,191)" strokeWidth={1.8} strokeLinecap="round" />

      {/* Handles for the selected keyframe only. */}
      {sel && !disabled && (
        <>
          {selected > 0 && (
            <>
              <line
                x1={vx(sel.x)}
                y1={vy(sel.sv)}
                x2={vx(sel.x + sel.in.x)}
                y2={vy(sel.sv + sel.in.y)}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={0.8}
              />
              <rect
                x={vx(sel.x + sel.in.x) - 3}
                y={vy(sel.sv + sel.in.y) - 3}
                width={6}
                height={6}
                fill="#fff"
                stroke="rgb(45,212,191)"
                strokeWidth={1}
                className="cursor-grab"
                onPointerDown={onPointerDown("in", selected)}
              />
            </>
          )}
          {selected < curve.length - 1 && (
            <>
              <line
                x1={vx(sel.x)}
                y1={vy(sel.sv)}
                x2={vx(sel.x + sel.out.x)}
                y2={vy(sel.sv + sel.out.y)}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={0.8}
              />
              <rect
                x={vx(sel.x + sel.out.x) - 3}
                y={vy(sel.sv + sel.out.y) - 3}
                width={6}
                height={6}
                fill="#fff"
                stroke="rgb(45,212,191)"
                strokeWidth={1}
                className="cursor-grab"
                onPointerDown={onPointerDown("out", selected)}
              />
            </>
          )}
        </>
      )}

      {curve.map((kf, i) => (
        <circle
          key={i}
          cx={vx(kf.x)}
          cy={vy(kf.sv)}
          r={i === selected ? 5 : 4}
          fill={i === selected ? "rgb(45,212,191)" : "#fff"}
          stroke={i === selected ? "#fff" : "rgb(45,212,191)"}
          strokeWidth={1.2}
          className={disabled ? "" : "cursor-grab"}
          onPointerDown={onPointerDown("kf", i)}
        />
      ))}
    </svg>
  );
}
