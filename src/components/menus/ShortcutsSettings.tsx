import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_EDITOR_KEYBINDS,
  EDITOR_SNAP_ACTIONS,
  editorKeyLabel,
  editorKeybindConflictActions,
  editorKeybindConflicts,
  type EditorAction,
  type EditorKeybinds,
} from "../../lib/editorKeybinds";
import type { AltWheelAction } from "../../types";
import { InfoTip } from "../ui/Tooltip";
import { Button, INPUT_CLASS, TextInput } from "../ui/Controls";
import { WarningIcon } from "../ui/Icons";
import { parseCustomDivisors } from "../../lib/snapPresets";
import { useT } from "../../lib/i18n";

export function ShortcutsSettings({
  keybinds,
  onKeybinds,
  altWheelAction,
  customSnapDivisors,
  onCustomSnapDivisors,
  query: externalQuery,
}: {
  keybinds: EditorKeybinds;
  onKeybinds: (keybinds: EditorKeybinds) => void;
  altWheelAction: AltWheelAction;
  customSnapDivisors: number[];
  onCustomSnapDivisors: (value: number[]) => void;
  /** Settings search: when set, filters the list and hides its own toolbar. */
  query?: string;
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
      clashing={clashing.has(action)}
      onCapture={setCapturing}
      onBind={bind}
    />
  );

  const [query, setQuery] = useState("");
  const clashing = editorKeybindConflictActions(keybinds);
  const searching = externalQuery !== undefined;
  const filter = (searching ? externalQuery : query).trim().toLowerCase();

  return (
    <ShortcutFilter.Provider value={filter}>
      {!searching && (
      <div className="sticky top-0 z-[1] -mx-1 mb-5 flex flex-wrap items-center gap-3 bg-ink-800 px-1 pb-3">
        <label className="relative min-w-[12rem] flex-1">
          <svg viewBox="0 0 16 16" aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
            <path d="m13.5 13.5-3-3m1.5-3.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("shortcuts.filter")}
            aria-label={t("shortcuts.filter")}
            className={`${INPUT_CLASS} w-full max-w-sm pl-8`}
          />
        </label>
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <span className="keycap keycap-editable">K</span>
          {t("shortcuts.editable")}
          <InfoTip content={t("shortcuts.editableInfo")} />
        </p>
        <Button
          size="sm"
          variant="primary"
          disabled={!customized}
          onClick={() => onKeybinds({ ...DEFAULT_EDITOR_KEYBINDS })}
        >
          {t("shortcuts.resetAll")}
        </Button>
        {conflicts.length > 0 && (
          <p
            role="alert"
            className="flex w-full items-start gap-2 rounded-md bg-amber-400/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-200 ring-1 ring-inset ring-amber-400/25"
          >
            <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0 text-amber-300" />
            {conflicts.join(" · ")}
          </p>
        )}
      </div>
      )}
      <div className={`gap-10 text-sm ${searching ? "" : "uilg:columns-2"}`}>
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
          <ShortcutRow keys="Esc" text={t("shortcuts.esc.text")} />
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
          {row("snapPrevious", t("shortcuts.row.snapPrevious"))}
          {row("snapNext", t("shortcuts.row.snapNext"))}
          {row("snapPreset", t("shortcuts.row.snapPreset"))}
          <CustomDivisorsField value={customSnapDivisors} onChange={onCustomSnapDivisors} />
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
    </ShortcutFilter.Provider>
  );
}

/** The filter typed above the list; rows that do not match hide themselves. */
const ShortcutFilter = createContext("");

function useShortcutMatch(...parts: string[]) {
  const filter = useContext(ShortcutFilter);
  return !filter || parts.some((part) => part.toLowerCase().includes(filter));
}

/**
 * A section of the reference. Sections sit in two balanced columns and never
 * split across them; one with no matching rows disappears while filtering.
 */
function ShortcutSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-7 break-inside-avoid [&:not(:has([data-shortcut]))]:hidden">
      <h3 className="mb-1 font-display text-[0.875rem] font-semibold text-slate-100">{title}</h3>
      <div className="divide-y divide-white/[0.05]">{children}</div>
    </section>
  );
}

const KEY_NAMES = new Set([
  "ctrl", "cmd", "ctrl/cmd", "strg", "strg/cmd", "shift", "alt", "option", "space", "tab", "esc",
  "enter", "delete", "backspace", "home", "end", "page up", "page down", "arrow up", "arrow down",
  "arrow left", "arrow right", "kiai",
]);

/** Whether a token from a shortcut string names a key rather than a gesture
 * or a place in the interface ("drag", "Timeline wheel", "Map Settings"). */
function isKey(token: string): boolean {
  const lower = token.trim().toLowerCase();
  if (!lower) return false;
  if (KEY_NAMES.has(lower)) return true;
  if (/^f\d{1,2}$/.test(lower)) return true;
  // Single characters and short symbols: Q, +, [, 1.
  return [...lower].length <= 2 && !/^[a-z]{2}$/.test(lower);
}

/** Draws "Ctrl/Cmd + Shift + Z" as keycaps and "Edit: drag" as words. */
function Keys({ keys }: { keys: string }) {
  const combos = keys.split(" / ");
  return (
    <span className="flex flex-wrap items-center justify-end gap-1 text-right">
      {combos.map((combo, ci) => (
        <span key={ci} className="flex items-center gap-1">
          {ci > 0 && <span className="px-0.5 text-xs text-slate-600">/</span>}
          {combo.split(" + ").map((token, ti) => (
            <span key={ti} className="flex items-center gap-1">
              {ti > 0 && <span className="text-2xs text-slate-600">+</span>}
              {isKey(token) ? (
                <kbd className="keycap">{token.trim()}</kbd>
              ) : (
                <span className="text-xs text-slate-400">{token.trim()}</span>
              )}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function ShortcutRow({ keys, text }: { keys: string; text: string }) {
  if (!useShortcutMatch(keys, text)) return null;
  return (
    <div data-shortcut className="flex min-h-[2.25rem] items-center justify-between gap-4 py-1.5">
      <span className="min-w-0 text-sm leading-snug text-slate-300">{text}</span>
      <span className="max-w-[45%] shrink-0">
        <Keys keys={keys} />
      </span>
    </div>
  );
}

function KeybindRow({
  action,
  text,
  keybinds,
  capturing,
  clashing,
  onCapture,
  onBind,
}: {
  action: EditorAction;
  text: string;
  keybinds: EditorKeybinds;
  capturing: EditorAction | null;
  clashing: boolean;
  onCapture: (action: EditorAction | null) => void;
  onBind: (action: EditorAction, code: string | null) => void;
}) {
  const t = useT();
  const isCapturing = capturing === action;
  const label = editorKeyLabel(keybinds[action]);
  const changed = keybinds[action] !== DEFAULT_EDITOR_KEYBINDS[action];
  if (!useShortcutMatch(label, text)) return null;
  return (
    <div data-shortcut className="flex min-h-[2.25rem] items-center justify-between gap-4 py-1.5">
      <span className="min-w-0 text-sm leading-snug text-slate-300">{text}</span>
      <span className="flex shrink-0 items-center gap-2">
        {changed && !isCapturing && (
          <span className="text-2xs text-slate-500">
            {editorKeyLabel(DEFAULT_EDITOR_KEYBINDS[action])} →
          </span>
        )}
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
          aria-label={`${text}: ${label}`}
          className={`keycap keycap-editable cursor-pointer transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
            isCapturing
              ? "!bg-accent/20 !text-slate-50 outline outline-1 outline-offset-1 outline-accent/70"
              : clashing
                ? "outline outline-1 outline-offset-1 outline-amber-400/80"
                : "hover:!bg-white/[0.12]"
          }`}
          title={t("shortcuts.rebind")}
        >
          {isCapturing ? t("shortcuts.pressKey") : label}
        </button>
      </span>
    </div>
  );
}

/** The mapper's own divisor preset, typed as a list and tidied on commit. */
function CustomDivisorsField({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const t = useT();
  const [text, setText] = useState(value.join(" "));
  useEffect(() => setText(value.join(" ")), [value]);
  const commit = () => {
    const parsed = parseCustomDivisors(text);
    setText(parsed.join(" "));
    if (parsed.join(" ") !== value.join(" ")) onChange(parsed);
  };
  if (!useShortcutMatch(t("shortcuts.customDivisors"), t("shortcuts.customDivisorsHint"))) return null;
  return (
    <label data-shortcut className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-slate-300">{t("shortcuts.customDivisors")}</span>
        <span className="block text-xs leading-snug text-slate-500">{t("shortcuts.customDivisorsHint")}</span>
      </span>
      <TextInput
        value={text}
        placeholder="1 5 10 20"
        className="w-32 shrink-0 font-mono text-xs"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}
