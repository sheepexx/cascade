import { useState, type ReactNode } from "react";
import {
  DEFAULT_EDITOR_KEYBINDS,
  EDITOR_SNAP_ACTIONS,
  editorKeyLabel,
  editorKeybindConflicts,
  type EditorAction,
  type EditorKeybinds,
} from "../../lib/editorKeybinds";
import type { AltWheelAction } from "../../types";
import { InfoTip } from "../ui/Tooltip";
import { useT } from "../../lib/i18n";

export function ShortcutsSettings({
  keybinds,
  onKeybinds,
  altWheelAction,
}: {
  keybinds: EditorKeybinds;
  onKeybinds: (keybinds: EditorKeybinds) => void;
  altWheelAction: AltWheelAction;
}) {
  const t = useT();
  const [capturing, setCapturing] = useState<EditorAction | null>(null);
  const bind = (action: EditorAction, code: string | null) => {
    onKeybinds({
      ...keybinds,
      [action]: code ?? DEFAULT_EDITOR_KEYBINDS[action],
    });
  };
  const conflicts = editorKeybindConflicts(keybinds);
  const altWheelTarget = {
    interfaceScale: t("shortcuts.target.interface"),
    timelineZoom: t("shortcuts.target.timeline"),
    playfieldScale: t("shortcuts.target.playfield"),
    volume: t("shortcuts.target.volume"),
  }[altWheelAction];
  const customized = (Object.keys(DEFAULT_EDITOR_KEYBINDS) as EditorAction[])
    .some((action) => keybinds[action] !== DEFAULT_EDITOR_KEYBINDS[action]);
  const row = (action: EditorAction, text: string) => (
    <KeybindRow
      key={action}
      action={action}
      text={text}
      keybinds={keybinds}
      capturing={capturing}
      onCapture={setCapturing}
      onBind={bind}
    />
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-700/35 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          {t("shortcuts.editable")}
          <InfoTip content={t("shortcuts.editableInfo")} />
        </p>
        <button
          type="button"
          disabled={!customized}
          onClick={() => onKeybinds({ ...DEFAULT_EDITOR_KEYBINDS })}
          className="rounded-lg border border-white/10 bg-ink-700/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("shortcuts.resetAll")}
        </button>
        {conflicts.length > 0 && (
          <p className="w-full text-[11px] text-amber-300">
            {conflicts.join(" · ")}
          </p>
        )}
      </div>
      <div className="grid gap-5 text-sm text-slate-300 md:grid-cols-2">
        <ShortcutSection title={t("shortcuts.section.playback")}>
          {row("playPause", t("shortcuts.row.playPause"))}
          {row("slowMo", t("shortcuts.row.slowMo"))}
          {row("zenMode", t("shortcuts.row.zenMode"))}
          {row("volumeUp", t("shortcuts.row.volumeUp"))}
          {row("volumeDown", t("shortcuts.row.volumeDown"))}
          {row("playtestToggle", t("shortcuts.row.playtestToggle"))}
          <ShortcutRow keys={t("shortcuts.speed_buttons.keys")} text={t("shortcuts.speed_buttons.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.editing")}>
          <ShortcutRow keys="Q" text={t("shortcuts.q.text")} />
          <ShortcutRow keys={t("shortcuts.edit_click.keys")} text={t("shortcuts.edit_click.text")} />
          <ShortcutRow keys={t("shortcuts.edit_drag.keys")} text={t("shortcuts.edit_drag.text")} />
          <ShortcutRow keys={t("shortcuts.select_click.keys")} text={t("shortcuts.select_click.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_click.keys")} text={t("shortcuts.ctrl_cmd_click.text")} />
          <ShortcutRow keys={t("shortcuts.select_drag.keys")} text={t("shortcuts.select_drag.text")} />
          <ShortcutRow keys={t("shortcuts.right_click_note.keys")} text={t("shortcuts.right_click_note.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.selection")}>
          <ShortcutRow keys={t("shortcuts.shift_drag.keys")} text={t("shortcuts.shift_drag.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_a.keys")} text={t("shortcuts.ctrl_cmd_a.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_c.keys")} text={t("shortcuts.ctrl_cmd_c.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_x.keys")} text={t("shortcuts.ctrl_cmd_x.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_v.keys")} text={t("shortcuts.ctrl_cmd_v.text")} />
          {row("mirrorSelection", t("shortcuts.row.mirrorSelection"))}
          {row("reverseSelection", t("shortcuts.row.reverseSelection"))}
          {row("shuffleSelection", t("shortcuts.row.shuffleSelection"))}
          {row("scaleHalf", t("shortcuts.row.scaleHalf"))}
          {row("scaleDouble", t("shortcuts.row.scaleDouble"))}
          <ShortcutRow keys={t("shortcuts.delete_backspace.keys")} text={t("shortcuts.delete_backspace.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.navigation")}>
          <ShortcutRow keys={t("shortcuts.wheel.keys")} text={t("shortcuts.wheel.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_wheel.keys")} text={t("shortcuts.ctrl_cmd_wheel.text")} />
          <ShortcutRow keys={t("shortcuts.bottom_timeline_click_drag.keys")} text={t("shortcuts.bottom_timeline_click_drag.text")} />
          <ShortcutRow keys={t("shortcuts.timeline_wheel.keys")} text={t("shortcuts.timeline_wheel.text")} />
          <ShortcutRow keys={t("shortcuts.timestamp.keys")} text={t("shortcuts.timestamp.text")} />
          {row("addBookmark", t("shortcuts.row.addBookmark"))}
          {row("prevBookmark", t("shortcuts.row.prevBookmark"))}
          {row("nextBookmark", t("shortcuts.row.nextBookmark"))}
          <ShortcutRow keys={t("shortcuts.timeline_bookmark_controls.keys")} text={t("shortcuts.timeline_bookmark_controls.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.grid_and_display")}>
          <ShortcutRow keys={t("shortcuts.snap.keys")} text={t("shortcuts.snap.text")} />
          {EDITOR_SNAP_ACTIONS.map(({ action, divisor }) =>
            row(
              action,
              divisor === 0 ? t("shortcuts.snapFree") : t("shortcuts.snapTo", { divisor }),
            ),
          )}
          {row("scrollSpeedDown", t("shortcuts.row.scrollSpeedDown"))}
          {row("scrollSpeedUp", t("shortcuts.row.scrollSpeedUp"))}
          {row("zoomIn", t("shortcuts.row.zoomIn"))}
          {row("zoomOut", t("shortcuts.row.zoomOut"))}
          <ShortcutRow
            keys={t("shortcuts.alt_wheel.keys")}
            text={t("shortcuts.altWheelText", { target: altWheelTarget })}
          />
          <ShortcutRow keys={t("shortcuts.timeline_zoom.keys")} text={t("shortcuts.timeline_zoom.text")} />
          {row("toggleReceptors", t("shortcuts.row.toggleReceptors"))}
          {row("waveformOverlay", t("shortcuts.row.waveformOverlay"))}
          <ShortcutRow keys={t("shortcuts.pp_counter.keys")} text={t("shortcuts.pp_counter.text")} />
          <ShortcutRow keys="Kiai" text={t("shortcuts.kiai.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.hitsounds")}>
          {row("hitsoundMode", t("shortcuts.row.hitsoundMode"))}
          {row("whistleAdd", t("shortcuts.row.whistleAdd"))}
          {row("finishAdd", t("shortcuts.row.finishAdd"))}
          {row("clapAdd", t("shortcuts.row.clapAdd"))}
          <ShortcutRow keys={t("shortcuts.sample_set.keys")} text={t("shortcuts.sample_set.text")} />
          <ShortcutRow keys={t("shortcuts.w_f_c_labels.keys")} text={t("shortcuts.w_f_c_labels.text")} />
          <ShortcutRow keys={t("shortcuts.playback.keys")} text={t("shortcuts.playback.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.project")}>
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_s.keys")} text={t("shortcuts.ctrl_cmd_s.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_z.keys")} text={t("shortcuts.ctrl_cmd_z.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_shift_z.keys")} text={t("shortcuts.ctrl_cmd_shift_z.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_cmd_y.keys")} text={t("shortcuts.ctrl_cmd_y.text")} />
          <ShortcutRow keys={t("shortcuts.new.keys")} text={t("shortcuts.new.text")} />
          <ShortcutRow keys={t("shortcuts.export.keys")} text={t("shortcuts.export.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.menus")}>
          <ShortcutRow keys={t("shortcuts.map_settings.keys")} text={t("shortcuts.map_settings.text")} />
          <ShortcutRow keys={t("shortcuts.timing.keys")} text={t("shortcuts.timing.text")} />
          <ShortcutRow keys="SV" text={t("shortcuts.sv.text")} />
          <ShortcutRow keys={t("shortcuts.difficulty.keys")} text={t("shortcuts.difficulty.text")} />
          <ShortcutRow keys={t("shortcuts.tools.keys")} text={t("shortcuts.tools.text")} />
          <ShortcutRow keys={t("shortcuts.skin.keys")} text={t("shortcuts.skin.text")} />
          <ShortcutRow keys={t("shortcuts.settings.keys")} text={t("shortcuts.settings.text")} />
        </ShortcutSection>

        <ShortcutSection title={t("shortcuts.section.difficulty_list")}>
          <ShortcutRow keys={t("shortcuts.click_difficulty.keys")} text={t("shortcuts.click_difficulty.text")} />
          <ShortcutRow keys={t("shortcuts.ctrl_click.keys")} text={t("shortcuts.ctrl_click.text")} />
          <ShortcutRow keys="+" text={t("shortcuts.plus.text")} />
          <ShortcutRow keys={t("shortcuts.duplicate.keys")} text={t("shortcuts.duplicate.text")} />
          <ShortcutRow keys={t("shortcuts.delete.keys")} text={t("shortcuts.delete.text")} />
        </ShortcutSection>
      </div>
    </div>
  );
}

function ShortcutSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink-600 bg-ink-700/35 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function ShortcutRow({ keys, text }: { keys: string; text: string }) {
  return (
    <div className="grid grid-cols-[8.5rem,1fr] gap-3 text-xs leading-5">
      <div className="font-mono text-[11px] font-semibold text-slate-100">
        {keys}
      </div>
      <div className="text-slate-400">{text}</div>
    </div>
  );
}

function KeybindRow({
  action,
  text,
  keybinds,
  capturing,
  onCapture,
  onBind,
}: {
  action: EditorAction;
  text: string;
  keybinds: EditorKeybinds;
  capturing: EditorAction | null;
  onCapture: (action: EditorAction | null) => void;
  onBind: (action: EditorAction, code: string | null) => void;
}) {
  const t = useT();
  const isCapturing = capturing === action;
  return (
    <div className="grid grid-cols-[8.5rem,1fr] items-center gap-3 text-xs leading-5">
      <button
        type="button"
        onClick={() => onCapture(isCapturing ? null : action)}
        onKeyDown={(event) => {
          if (!isCapturing) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") onCapture(null);
          else if (event.key === "Backspace" || event.key === "Delete") {
            onBind(action, null);
            onCapture(null);
          } else {
            onBind(action, event.code);
            onCapture(null);
          }
        }}
        onBlur={() => {
          if (isCapturing) onCapture(null);
        }}
        className={`justify-self-start rounded-md border px-1.5 py-0.5 text-left font-mono text-[11px] font-semibold transition ${
          isCapturing
            ? "border-accent/80 bg-accent/20 text-slate-100"
            : "border-white/10 bg-ink-700/60 text-slate-100 hover:border-accent/50"
        }`}
        title={t("shortcuts.rebind")}
      >
        {isCapturing ? t("shortcuts.pressKey") : editorKeyLabel(keybinds[action])}
      </button>
      <div className="text-slate-400">{text}</div>
    </div>
  );
}
