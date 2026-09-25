import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  HUD_ELEMENTS,
  type HudElementId,
  type HudPlacement,
  type PlaytestSettings,
} from "../types";
import {
  DEFAULT_HUD_PLACEMENT,
  HUD_VISIBILITY,
  MAX_HUD_SCALE,
  MIN_HUD_SCALE,
  hudPlacement,
  isDefaultPlacement,
  withPlacement,
} from "../lib/hudLayout";
import { MAX_HIT_POSITION, MIN_HIT_POSITION } from "../lib/playtestClock";
import { useT, type MessageKey } from "../lib/i18n";
import { Slider, Toggle } from "./ui/Controls";

// The playtest's HUD editor: the map plays on autoplay while every part of
// the HUD can be clicked, dragged and tuned from a panel on the left.

export type HudTarget = HudElementId | "receptor" | "playfield";

/** Width of the editor's panel; the playfield makes room for it. */
export const HUD_PANEL_WIDTH = 320;

const SNAP_PX = 8;

type Meta = { name: MessageKey; description: MessageKey; hue: string };

const META: Record<HudTarget, Meta> = {
  playfield: { name: "settings.zoom", description: "hud.playfieldDesc", hue: "#8b93ff" },
  receptor: { name: "hud.receptor", description: "hud.receptorDesc", hue: "#e86868" },
  combo: { name: "hud.combo", description: "hud.comboDesc", hue: "#f5f7fb" },
  judgement: { name: "hud.judgement", description: "hud.judgementDesc", hue: "#5bc0ff" },
  accuracy: { name: "hud.accuracy", description: "hud.accuracyDesc", hue: "#fbbf24" },
  counts: { name: "hud.counts", description: "hud.countsDesc", hue: "#a78bfa" },
  errorBar: { name: "hud.errorBar", description: "hud.errorBarDesc", hue: "#6fcf5f" },
  keys: { name: "hud.keys", description: "hud.keysDesc", hue: "#e86868" },
  npsGraph: { name: "hud.npsGraph", description: "hud.npsGraphDesc", hue: "#5eead4" },
  runStats: { name: "hud.runStats", description: "hud.runStatsDesc", hue: "#94a3b8" },
};

/**
 * One HUD element, placed at its default anchor and then moved and scaled by
 * the layout. In the editor it can be selected and dragged; hidden elements
 * show as ghosts there so they can be found again.
 */
export function HudItem({
  id,
  className = "",
  style,
  placement,
  visible,
  editing,
  selected,
  onSelect,
  onPlace,
  fill = false,
  children,
}: {
  id: HudElementId;
  /** Positions the element's default spot. */
  className?: string;
  style?: CSSProperties;
  placement: HudPlacement;
  visible: boolean;
  editing: boolean;
  selected: boolean;
  onSelect?: (id: HudElementId) => void;
  onPlace?: (id: HudElementId, placement: HudPlacement) => void;
  /** Stretch to the anchor's height, for elements that size to it. */
  fill?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const [draft, setDraft] = useState<HudPlacement | null>(null);
  const drag = useRef<{ x: number; y: number; from: HudPlacement; moved: boolean } | null>(null);
  if (!visible && !editing) return null;
  const shown = draft ?? placement;

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: placement, moved: false };
    onSelect?.(id);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    let x = Math.round(d.from.x + dx);
    let y = Math.round(d.from.y + dy);
    // Settle back onto the default spot when dragged close to it.
    if (Math.abs(x) < SNAP_PX) x = 0;
    if (Math.abs(y) < SNAP_PX) y = 0;
    setDraft({ ...d.from, x, y });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && draft) onPlace?.(id, draft);
    setDraft(null);
  };

  return (
    <div className={`pointer-events-none absolute ${className}`} style={style}>
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className={`relative ${fill ? "h-full" : ""} ${
          editing
            ? `pointer-events-auto cursor-grab touch-none select-none rounded-xl outline-offset-4 transition-[outline-color,opacity] duration-150 active:cursor-grabbing ${
                selected
                  ? "outline outline-2 outline-accent"
                  : "outline outline-1 outline-transparent hover:outline-white/40"
              } ${visible ? "" : "opacity-35 [outline-style:dashed] outline-white/30"}`
            : ""
        }`}
        style={{
          transform: `translate(${shown.x}px, ${shown.y}px) scale(${shown.scale})`,
          transformOrigin: "center",
        }}
      >
        {children}
        {editing && selected && (
          <span className="hud-tag-in pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg">
            {t(META[id].name)}
            {draft && ` · ${draft.x}, ${draft.y}`}
          </span>
        )}
      </div>
    </div>
  );
}

type Bounds = { left: number; width: number; hitY: number; height: number };

/**
 * Click areas over the playfield and its judgement line. Dragging the line
 * moves the hit position live, so the receptors follow the pointer.
 */
export function PlayfieldHandles({
  boundsRef,
  hitPosition,
  upscroll,
  selected,
  onSelect,
  onHitPosition,
}: {
  boundsRef: { current: Bounds | null };
  hitPosition: number;
  upscroll: boolean;
  selected: HudTarget | null;
  onSelect: (target: HudTarget) => void;
  onHitPosition: (value: number) => void;
}) {
  const t = useT();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const drag = useRef<{ y: number; from: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = boundsRef.current;
      setBounds((prev) =>
        next &&
        (!prev ||
          prev.left !== next.left ||
          prev.width !== next.width ||
          prev.hitY !== next.hitY ||
          prev.height !== next.height)
          ? { ...next }
          : prev,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [boundsRef]);

  if (!bounds) return null;
  const receptorOn = selected === "receptor";
  const playfieldOn = selected === "playfield";

  return (
    <>
      <div
        onPointerDown={(e) => {
          if (e.button === 0) onSelect("playfield");
        }}
        className={`pointer-events-auto absolute top-0 cursor-pointer rounded-lg outline-offset-2 transition-[outline-color,background-color] duration-150 ${
          playfieldOn
            ? "bg-white/[0.03] outline outline-2 outline-accent/70"
            : "outline outline-1 outline-transparent hover:bg-white/[0.02] hover:outline-white/25"
        }`}
        style={{ left: bounds.left, width: bounds.width, height: bounds.height }}
      />
      <div
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, from: hitPosition };
          setDragging(true);
          onSelect("receptor");
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dy = e.clientY - d.y;
          const next = Math.round(d.from + (upscroll ? dy : -dy));
          onHitPosition(Math.min(MAX_HIT_POSITION, Math.max(MIN_HIT_POSITION, next)));
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        className="group pointer-events-auto absolute flex cursor-ns-resize touch-none items-center"
        style={{ left: bounds.left - 12, width: bounds.width + 24, top: bounds.hitY - 14, height: 28 }}
      >
        <div
          className={`mx-3 h-[3px] w-full rounded-full transition-[background-color,box-shadow] duration-150 ${
            receptorOn || dragging
              ? "bg-accent shadow-[0_0_14px_rgba(232,104,104,0.9)]"
              : "bg-transparent group-hover:bg-white/50"
          }`}
        />
        <span
          className={`pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums shadow-lg transition-opacity duration-150 ${
            receptorOn || dragging
              ? "bg-accent text-white opacity-100"
              : "bg-ink-900/85 text-slate-200 opacity-0 group-hover:opacity-100"
          }`}
        >
          {t("hud.receptor")} · {hitPosition} px
        </span>
        <span className="pointer-events-none absolute left-full ml-2 flex flex-col items-center text-[9px] leading-[9px] text-white/60 opacity-0 transition-opacity group-hover:opacity-100">
          ▲<br />▼
        </span>
      </div>
    </>
  );
}

/** A small picture of each part of the HUD, for the panel. */
function Illustration({ target }: { target: HudTarget }) {
  const hue = META[target].hue;
  const lanes = (
    <g stroke="rgba(255,255,255,0.12)">
      {[34, 47, 60, 73, 86].map((x) => (
        <line key={x} x1={x} y1={4} x2={x} y2={60} />
      ))}
    </g>
  );
  switch (target) {
    case "playfield":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          <rect x={34} y={4} width={52} height={56} rx={3} fill="rgba(255,255,255,0.04)" />
          {lanes}
          <rect x={35} y={14} width={11} height={4} rx={1.5} fill="#f2f2f2" />
          <rect x={61} y={26} width={11} height={4} rx={1.5} fill={hue} />
          <rect x={48} y={36} width={11} height={4} rx={1.5} fill="#f2f2f2" />
          <rect x={74} y={20} width={11} height={4} rx={1.5} fill={hue} />
          <line x1={34} y1={50} x2={86} y2={50} stroke="#e86868" strokeWidth={1.5} />
        </svg>
      );
    case "receptor":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          {lanes}
          <line x1={30} y1={40} x2={90} y2={40} stroke={hue} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={30} y1={50} x2={90} y2={50} stroke="rgba(232,104,104,0.3)" strokeWidth={1.5} strokeDasharray="3 3" />
          <path d="M98 44 L102 38 L106 44 M98 46 L102 52 L106 46" stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "combo":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          <text x={60} y={42} textAnchor="middle" fontSize={26} fontWeight={900} fill={hue}>
            128
          </text>
        </svg>
      );
    case "judgement":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          <text x={60} y={36} textAnchor="middle" fontSize={20} fontWeight={900} fill="#fff" letterSpacing={1}>
            MAX
          </text>
          <text x={60} y={52} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.6)">
            +3 ms
          </text>
        </svg>
      );
    case "accuracy":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          <text x={60} y={40} textAnchor="middle" fontSize={19} fontWeight={800} fill={hue}>
            99.12%
          </text>
        </svg>
      );
    case "counts":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          {[
            ["MAX", 44, "#5bc0ff"],
            ["300", 30, "#5bc0ff"],
            ["100", 12, "#6fcf5f"],
            ["MISS", 4, "#f87171"],
          ].map(([label, width, color], i) => (
            <g key={label as string}>
              <text x={30} y={17 + i * 12} fontSize={7} fill="rgba(255,255,255,0.7)">
                {label}
              </text>
              <rect x={52} y={11 + i * 12} width={width as number} height={6} rx={2} fill={color as string} opacity={0.85} />
            </g>
          ))}
        </svg>
      );
    case "errorBar":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          <rect x={20} y={30} width={80} height={4} rx={2} fill="#e6a23c" />
          <rect x={35} y={30} width={50} height={4} rx={2} fill="#6fcf5f" />
          <rect x={48} y={30} width={24} height={4} rx={2} fill="#5bc0ff" />
          {[52, 57, 61, 64, 70, 45].map((x) => (
            <rect key={x} x={x} y={25} width={1.5} height={14} fill="#fff" opacity={0.75} />
          ))}
          <path d="M58 18 L62 18 L60 22 Z" fill="#fff" />
        </svg>
      );
    case "keys":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          {["D", "F", "J", "K"].map((key, i) => (
            <g key={key}>
              <rect
                x={24 + i * 19}
                y={22}
                width={16}
                height={18}
                rx={4}
                fill={i === 1 ? hue : "rgba(255,255,255,0.06)"}
                stroke="rgba(255,255,255,0.18)"
              />
              <text x={32 + i * 19} y={34} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">
                {key}
              </text>
            </g>
          ))}
        </svg>
      );
    case "npsGraph":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          {[8, 14, 22, 30, 18, 26, 36, 40, 28, 20, 32, 24].map((h, i) => (
            <rect key={i} x={22 + i * 6.5} y={52 - h} width={5} height={h} rx={1} fill={hue} opacity={0.35 + (h / 40) * 0.6} />
          ))}
          <line x1={20} y1={30} x2={100} y2={30} stroke="#fff" strokeWidth={1} opacity={0.7} />
        </svg>
      );
    case "runStats":
      return (
        <svg viewBox="0 0 120 64" className="h-full w-full">
          <rect x={26} y={12} width={68} height={40} rx={6} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" />
          {[0, 1, 2].map((row) => (
            <g key={row}>
              <rect x={32} y={20 + row * 10} width={18} height={4} rx={2} fill="rgba(255,255,255,0.35)" />
              <rect x={70} y={20 + row * 10} width={18} height={4} rx={2} fill="rgba(255,255,255,0.75)" />
            </g>
          ))}
        </svg>
      );
  }
}

function IconTile({ target, small = false }: { target: HudTarget; small?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-ink-900/70 ${
        small ? "h-9 w-12" : "h-24 w-full"
      }`}
    >
      <span className={small ? "h-full w-full scale-[1.4]" : "h-full w-full p-2"}>
        <Illustration target={target} />
      </span>
    </span>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx={12} cy={12} r={3} />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  );
}

function NumberBox({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-ink-700/60 px-2 transition focus-within:border-accent/60">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) {
            onChange(Math.round(Math.min(max, Math.max(min, n))));
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full min-w-0 bg-transparent py-1.5 text-right text-sm tabular-nums text-slate-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && <span className="text-[11px] text-slate-500">{unit}</span>}
    </label>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
      <span>{label}</span>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-slate-200">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-slate-300">{display}</span>
      </div>
      <Slider size="sm" min={min} max={max} step={step} value={value} onChange={onChange} aria-label={label} />
    </div>
  );
}

/** The editor's panel on the left: every element, or the one being edited. */
export function HudEditorPanel({
  settings,
  selected,
  onSelect,
  onPatch,
  onDone,
}: {
  settings: PlaytestSettings;
  selected: HudTarget | null;
  onSelect: (target: HudTarget | null) => void;
  onPatch: (patch: Partial<PlaytestSettings>) => void;
  onDone: () => void;
}) {
  const t = useT();
  const place = (id: HudElementId, placement: HudPlacement) =>
    onPatch({ hud: withPlacement(settings.hud, id, placement) });
  const visible = (id: HudElementId) => settings[HUD_VISIBILITY[id]] === true;
  const setVisible = (id: HudElementId, value: boolean) =>
    onPatch({ [HUD_VISIBILITY[id]]: value } as Partial<PlaytestSettings>);
  const moved = HUD_ELEMENTS.some((id) => !isDefaultPlacement(hudPlacement(settings.hud, id)));

  const listRow = (target: HudTarget) => {
    const element = target !== "playfield" && target !== "receptor" ? target : null;
    const shown = element ? visible(element) : true;
    return (
      <div
        key={target}
        className="group flex items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 transition hover:border-white/10 hover:bg-white/[0.04]"
      >
        <button
          type="button"
          onClick={() => onSelect(target)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
        >
          <span className={shown ? "" : "opacity-40"}>
            <IconTile target={target} small />
          </span>
          <span className="min-w-0">
            <span className={`block truncate text-sm font-medium ${shown ? "text-slate-100" : "text-slate-500"}`}>
              {t(META[target].name)}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {t(META[target].description)}
            </span>
          </span>
        </button>
        {element && (
          <button
            type="button"
            aria-pressed={shown}
            aria-label={t("hud.visible")}
            title={t("hud.visible")}
            onClick={() => setVisible(element, !shown)}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition ${
              shown ? "text-slate-300 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-white/10 hover:text-slate-300"
            }`}
          >
            <EyeIcon open={shown} />
          </button>
        )}
      </div>
    );
  };

  const detail = (target: HudTarget) => {
    const element = target !== "playfield" && target !== "receptor" ? target : null;
    const placement = element ? hudPlacement(settings.hud, element) : DEFAULT_HUD_PLACEMENT;
    return (
      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
        >
          <span aria-hidden>←</span>
          {t("hud.allElements")}
        </button>
        <div className="flex flex-col gap-3">
          <IconTile target={target} />
          <div>
            <h3 className="text-base font-semibold text-slate-50">{t(META[target].name)}</h3>
            <p className="mt-0.5 text-[12px] leading-snug text-slate-400">{t(META[target].description)}</p>
          </div>
        </div>

        {element && (
          <div className="flex flex-col gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <Row label={t("hud.visible")}>
              <Toggle size="sm" checked={visible(element)} onChange={(v) => setVisible(element, v)} aria-label={t("hud.visible")} />
            </Row>
            <SliderRow
              label={t("hud.size")}
              value={placement.scale}
              min={MIN_HUD_SCALE}
              max={MAX_HUD_SCALE}
              step={0.05}
              display={`${Math.round(placement.scale * 100)}%`}
              onChange={(scale) => place(element, { ...placement, scale })}
            />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>{t("hud.position")}</span>
                <button
                  type="button"
                  disabled={placement.x === 0 && placement.y === 0}
                  onClick={() => place(element, { ...placement, x: 0, y: 0 })}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {t("hud.resetPosition")}
                </button>
              </div>
              <div className="flex gap-2">
                <NumberBox label="X" value={placement.x} min={-4000} max={4000} unit="px" onChange={(x) => place(element, { ...placement, x })} />
                <NumberBox label="Y" value={placement.y} min={-4000} max={4000} unit="px" onChange={(y) => place(element, { ...placement, y })} />
              </div>
              <p className="text-[11px] leading-snug text-slate-500">{t("hud.dragHint")}</p>
            </div>
          </div>
        )}

        {(target === "judgement" || target === "combo") && (
          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            {target === "judgement" && (
              <Row label={t("settings.showHitError")}>
                <Toggle size="sm" checked={settings.showHitError} onChange={(v) => onPatch({ showHitError: v })} aria-label={t("settings.showHitError")} />
              </Row>
            )}
            {target === "judgement" && (
              <Row label={t("settings.skinJudgements")}>
                <Toggle size="sm" checked={settings.useSkinJudgements} onChange={(v) => onPatch({ useSkinJudgements: v })} aria-label={t("settings.skinJudgements")} />
              </Row>
            )}
            {target === "combo" && (
              <Row label={t("settings.skinComboFont")}>
                <Toggle size="sm" checked={settings.useSkinComboFont} onChange={(v) => onPatch({ useSkinComboFont: v })} aria-label={t("settings.skinComboFont")} />
              </Row>
            )}
          </div>
        )}

        {target === "receptor" && (
          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <SliderRow
              label={t("settings.hitPosition")}
              value={settings.hitPosition}
              min={MIN_HIT_POSITION}
              max={MAX_HIT_POSITION}
              step={1}
              display={`${settings.hitPosition} px`}
              onChange={(hitPosition) => onPatch({ hitPosition })}
            />
            <p className="text-[11px] leading-snug text-slate-500">{t("hud.receptorDrag")}</p>
          </div>
        )}

        {target === "playfield" && (
          <div className="flex flex-col gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <SliderRow
              label={t("settings.zoom")}
              value={settings.zoom}
              min={0.5}
              max={3}
              step={0.05}
              display={`${Math.round(settings.zoom * 100)}%`}
              onChange={(zoom) => onPatch({ zoom })}
            />
            <SliderRow
              label={t("settings.backgroundDim")}
              value={settings.backgroundDim}
              min={0}
              max={100}
              step={1}
              display={`${Math.round(settings.backgroundDim)}%`}
              onChange={(backgroundDim) => onPatch({ backgroundDim })}
            />
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <aside
      aria-label={t("hud.editor")}
      className="hud-panel-in fixed inset-y-0 left-0 z-[120] flex flex-col border-r border-white/10 bg-ink-900/95 shadow-[12px_0_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      style={{ width: HUD_PANEL_WIDTH }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 pb-4 pt-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
            {t("hud.overline")}
          </div>
          <h2 className="mt-0.5 text-lg font-semibold text-slate-50">{t("hud.editor")}</h2>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{t("hud.hint")}</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-soft active:scale-[0.97]"
        >
          {t("hud.done")}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
        <div key={selected ?? "list"} className="hud-page-in">
          {selected ? (
            detail(selected)
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {t("hud.groupPlayfield")}
                </span>
                {listRow("playfield")}
                {listRow("receptor")}
              </div>
              <div className="flex flex-col gap-1">
                <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {t("hud.groupHud")}
                </span>
                {HUD_ELEMENTS.map(listRow)}
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="border-t border-white/[0.07] px-5 py-3">
        <button
          type="button"
          disabled={!moved}
          onClick={() => onPatch({ hud: {} })}
          className="w-full rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {t("hud.resetLayout")}
        </button>
      </footer>
    </aside>,
    document.body,
  );
}
