import { useState } from "react";
import {
  LayoutPanel,
  PlayfieldHandles,
  SliderRow,
  type LayoutGroup,
} from "./HudEditor";
import type { PlayfieldBounds } from "../lib/hudLayout";
import { MAX_HIT_POSITION, MIN_HIT_POSITION } from "../lib/playtestClock";
import { MAX_SCROLL_SPEED, MIN_SCROLL_SPEED, type AppSettings } from "../types";
import { useT } from "../lib/i18n";

/**
 * The editor's half of the layout editor.
 *
 * Playtest's HUD elements are not here: a combo counter or an error bar has
 * nothing to show outside a run, which is why the HUD editor plays the map
 * while it is open. What is left is the geometry both modes share, so the same
 * panel and the same drag handles serve it — the editor just points them at
 * AppSettings instead of PlaytestSettings.
 */
export function EditorLayoutOverlay({
  settings,
  scrollSpeed,
  playfieldBoundsRef,
  onPatch,
  onScrollSpeed,
  onDone,
}: {
  settings: AppSettings;
  scrollSpeed: number;
  playfieldBoundsRef: { current: PlayfieldBounds | null };
  onPatch: (patch: Partial<AppSettings>) => void;
  onScrollSpeed: (value: number) => void;
  onDone: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);

  const groups: LayoutGroup[] = [
    {
      label: t("hud.groupGameplay"),
      targets: [
        {
          id: "scroll",
          name: t("settings.scrollSpeed"),
          description: t("hud.scrollDesc"),
          illustration: <PlayfieldIcon kind="scroll" />,
          summary: String(scrollSpeed),
          controls: () => (
            <SliderRow
              label={t("settings.scrollSpeed")}
              value={scrollSpeed}
              min={MIN_SCROLL_SPEED}
              max={MAX_SCROLL_SPEED}
              step={1}
              display={String(scrollSpeed)}
              onChange={onScrollSpeed}
            />
          ),
        },
      ],
    },
    {
      label: t("hud.groupPlayfield"),
      targets: [
        {
          id: "playfield",
          name: t("settings.zoom"),
          description: t("hud.playfieldDesc"),
          illustration: <PlayfieldIcon kind="playfield" />,
          summary: `${Math.round(settings.playfieldScale * 100)}%`,
          controls: () => (
            <>
              <SliderRow
                label={t("settings.zoom")}
                value={settings.playfieldScale}
                min={0.5}
                max={3}
                step={0.05}
                display={`${Math.round(settings.playfieldScale * 100)}%`}
                onChange={(playfieldScale) => onPatch({ playfieldScale })}
              />
              <SliderRow
                label={t("settings.backgroundDim")}
                value={settings.dimBackground}
                min={0}
                max={100}
                step={1}
                display={`${Math.round(settings.dimBackground)}%`}
                onChange={(dimBackground) => onPatch({ dimBackground })}
              />
            </>
          ),
        },
        {
          id: "receptor",
          name: t("hud.receptor"),
          description: t("hud.receptorDesc"),
          dragHint: t("hud.receptorDrag"),
          illustration: <PlayfieldIcon kind="receptor" />,
          summary: `${settings.playfieldHitPosition} px`,
          controls: () => (
            <SliderRow
              label={t("settings.hitPosition")}
              value={settings.playfieldHitPosition}
              min={MIN_HIT_POSITION}
              max={MAX_HIT_POSITION}
              step={1}
              display={`${settings.playfieldHitPosition} px`}
              onChange={(playfieldHitPosition) => onPatch({ playfieldHitPosition })}
            />
          ),
        },
        {
          id: "notes",
          name: t("settings.noteHeight"),
          description: t("settings.noteHeightHint"),
          illustration: <PlayfieldIcon kind="notes" />,
          summary: `${Math.round(settings.noteHeightScale * 100)}%`,
          controls: () => (
            <>
              <SliderRow
                label={t("settings.noteHeight")}
                value={settings.noteHeightScale}
                min={0.5}
                max={2}
                step={0.05}
                display={`${Math.round(settings.noteHeightScale * 100)}%`}
                onChange={(noteHeightScale) => onPatch({ noteHeightScale })}
              />
              <SliderRow
                label={t("settings.bodyWidth")}
                value={settings.longNoteBodyScale}
                min={0.5}
                max={1.5}
                step={0.05}
                display={`${Math.round(settings.longNoteBodyScale * 100)}%`}
                onChange={(longNoteBodyScale) => onPatch({ longNoteBodyScale })}
              />
            </>
          ),
        },
      ],
    },
  ];

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-30">
        <PlayfieldHandles
          boundsRef={playfieldBoundsRef}
          hitPosition={settings.playfieldHitPosition}
          upscroll={settings.upscroll}
          selected={selected}
          onSelect={setSelected}
          onHitPosition={(playfieldHitPosition) => onPatch({ playfieldHitPosition })}
        />
      </div>
      <LayoutPanel
        title={t("layout.editor")}
        overline={t("layout.overline")}
        groups={groups}
        selected={selected}
        onSelect={setSelected}
        onDone={onDone}
        hint={t("hud.hint")}
      />
    </>
  );
}

/** Small stand-ins matching the HUD editor's row illustrations. */
function PlayfieldIcon({ kind }: { kind: "scroll" | "playfield" | "receptor" | "notes" }) {
  const hue =
    kind === "scroll"
      ? "#5bc0ff"
      : kind === "playfield"
        ? "#8b93ff"
        : kind === "receptor"
          ? "#e86868"
          : "#5eead4";
  return (
    <svg viewBox="0 0 120 64" className="h-full w-full" aria-hidden>
      <g stroke="rgba(255,255,255,0.12)">
        {[34, 47, 60, 73, 86].map((x) => (
          <line key={x} x1={x} y1={4} x2={x} y2={60} />
        ))}
      </g>
      {kind === "receptor" ? (
        <line x1={32} y1={46} x2={88} y2={46} stroke={hue} strokeWidth={3} />
      ) : kind === "scroll" ? (
        <g stroke={hue} strokeWidth={3}>
          <line x1={60} y1={12} x2={60} y2={40} />
          <path d="M54 34l6 8 6-8" fill="none" />
        </g>
      ) : kind === "notes" ? (
        <g fill={hue}>
          <rect x={36} y={22} width={10} height={7} rx={2} />
          <rect x={62} y={36} width={10} height={7} rx={2} />
        </g>
      ) : (
        <rect
          x={32}
          y={6}
          width={56}
          height={52}
          rx={3}
          fill="none"
          stroke={hue}
          strokeWidth={3}
        />
      )}
    </svg>
  );
}
