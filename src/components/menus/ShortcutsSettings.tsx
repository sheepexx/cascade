import { useState, type ReactNode } from "react";
import {
  DEFAULT_EDITOR_KEYBINDS,
  editorKeyLabel,
  editorKeybindConflicts,
  type EditorAction,
  type EditorKeybinds,
} from "../../lib/editorKeybinds";

export function ShortcutsSettings({
  keybinds,
  onKeybinds,
}: {
  keybinds: EditorKeybinds;
  onKeybinds: (keybinds: EditorKeybinds) => void;
}) {
  const [capturing, setCapturing] = useState<EditorAction | null>(null);
  const bind = (action: EditorAction, code: string | null) => {
    onKeybinds({
      ...keybinds,
      [action]: code ?? DEFAULT_EDITOR_KEYBINDS[action],
    });
  };
  const conflicts = editorKeybindConflicts(keybinds);
  const customized = (Object.keys(DEFAULT_EDITOR_KEYBINDS) as EditorAction[])
    .some((action) => keybinds[action] !== DEFAULT_EDITOR_KEYBINDS[action]);
  const row = (action: EditorAction, text: string) => (
    <KeybindRow
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
        <p className="text-[11px] text-slate-400">
          Highlighted keys are editable: click one, then press the new key.
          Backspace restores the default, Esc cancels.
        </p>
        <button
          type="button"
          disabled={!customized}
          onClick={() => onKeybinds({ ...DEFAULT_EDITOR_KEYBINDS })}
          className="rounded-lg border border-white/10 bg-ink-700/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset all
        </button>
        {conflicts.length > 0 && (
          <p className="w-full text-[11px] text-amber-300">
            {conflicts.join(" · ")}
          </p>
        )}
      </div>
      <div className="grid gap-5 text-sm text-slate-300 md:grid-cols-2">
        <ShortcutSection title="Playback">
          {row("playPause", "Play or pause the song.")}
          {row("slowMo", "Hold to ease playback to 25%; release for 100%.")}
          {row("zenMode", "Toggle zen mode and hide editor chrome.")}
          {row("volumeUp", "Raise volume by 5%.")}
          {row("volumeDown", "Lower volume by 5%.")}
          {row("playtestToggle", "Enter or leave playtest mode.")}
          <ShortcutRow keys="Alt + wheel" text="Change volume over the notefield." />
          <ShortcutRow keys="Speed buttons" text="Set playback rate to 25%, 50%, 75% or 100%." />
        </ShortcutSection>

        <ShortcutSection title="Editing">
          <ShortcutRow keys="Q" text="Switch between Edit and Select modes." />
          <ShortcutRow keys="Edit: click" text="Place a snapped note or replace an existing note." />
          <ShortcutRow keys="Edit: drag" text="Create a long note from the drag range." />
          <ShortcutRow keys="Select: click" text="Select a placed note." />
          <ShortcutRow keys="Ctrl/Cmd + click" text="Toggle notes in the selection." />
          <ShortcutRow keys="Select: drag" text="Move selected notes by lane and snap time." />
          <ShortcutRow keys="Right click note" text="Delete that note, or the selected notes." />
        </ShortcutSection>

        <ShortcutSection title="Selection">
          <ShortcutRow keys="Shift + drag" text="Box select notes. Near edges, the notefield autoscrolls." />
          <ShortcutRow keys="Ctrl/Cmd + A" text="Select all notes in the active difficulty." />
          <ShortcutRow keys="Ctrl/Cmd + C" text="Copy selected notes." />
          <ShortcutRow keys="Ctrl/Cmd + X" text="Cut selected notes." />
          <ShortcutRow keys="Ctrl/Cmd + V" text="Paste copied notes at the snapped playhead time." />
          {row("mirrorSelection", "Mirror selected notes left↔right (flip columns).")}
          {row("reverseSelection", "Reverse the selected notes in time.")}
          {row("shuffleSelection", "Shuffle selected notes into random columns.")}
          {row("scaleHalf", "Halve the selected pattern's timing.")}
          {row("scaleDouble", "Double the selected pattern's timing.")}
          <ShortcutRow keys="Delete / Backspace" text="Delete selected notes." />
        </ShortcutSection>

        <ShortcutSection title="Navigation">
          <ShortcutRow keys="Wheel" text="Scrub the playhead by one snap step in the notefield." />
          <ShortcutRow keys="Ctrl/Cmd + wheel" text="Change snap divisor without zooming the page." />
          <ShortcutRow keys="Bottom timeline click/drag" text="Seek through the song." />
          <ShortcutRow keys="Timeline wheel" text="Adjust waveform sensitivity." />
          <ShortcutRow keys="Timestamp" text="Click either half of the time display to copy milliseconds or the timestamp." />
          {row("addBookmark", "Add a bookmark at the playhead.")}
          {row("prevBookmark", "Jump to the previous bookmark.")}
          {row("nextBookmark", "Jump to the next bookmark.")}
          <ShortcutRow keys="Timeline bookmark controls" text="Name bookmarks and loop between two markers." />
        </ShortcutSection>

        <ShortcutSection title="Grid and display">
          <ShortcutRow keys="Snap" text="Choose the grid divisor from 1/1 through 1/48, or Free for any millisecond." />
          {row("scrollSpeedDown", "Zoom the editor timeline out.")}
          {row("scrollSpeedUp", "Zoom the editor timeline in.")}
          {row("zoomIn", "Grow the playfield.")}
          {row("zoomOut", "Shrink the playfield.")}
          <ShortcutRow keys="Timeline zoom" text="Change the editor timeline scale. This is not exported." />
          {row("toggleReceptors", "Toggle receptors on or off.")}
          {row("waveformOverlay", "Toggle the waveform overlay on the hit lane.")}
          <ShortcutRow keys="PP counter" text="Shows max SS no-mod pp for the active difficulty." />
          <ShortcutRow keys="Kiai" text="Kiai timing sections tint notes during preview." />
        </ShortcutSection>

        <ShortcutSection title="Hitsounds">
          {row("hitsoundMode", "Toggle hitsound mode and per-note labels.")}
          {row("whistleAdd", "Add whistle to the selection in hitsound mode.")}
          {row("finishAdd", "Add finish to the selection in hitsound mode.")}
          {row("clapAdd", "Add clap to the selection in hitsound mode.")}
          <ShortcutRow keys="Sample set" text="Pick Auto, Normal, Soft or Drum for selected or new notes." />
          <ShortcutRow keys="W F C labels" text="Letters on a note show its applied additions." />
          <ShortcutRow keys="Playback" text="Map hitsounds always play, even outside hitsound mode." />
        </ShortcutSection>

        <ShortcutSection title="Project">
          <ShortcutRow keys="Ctrl/Cmd + S" text="Save progress locally." />
          <ShortcutRow keys="Ctrl/Cmd + Z" text="Undo beatmap edits." />
          <ShortcutRow keys="Ctrl/Cmd + Shift + Z" text="Redo beatmap edits." />
          <ShortcutRow keys="Ctrl/Cmd + Y" text="Redo on Windows-style shortcuts." />
          <ShortcutRow keys="New" text="Clear the current map and local project." />
          <ShortcutRow keys="Export" text="Export the active .osu or package the mapset as .osz." />
        </ShortcutSection>

        <ShortcutSection title="Menus">
          <ShortcutRow keys="Map Settings" text="Import maps, set media, and edit metadata." />
          <ShortcutRow keys="Timing" text="Edit uninherited BPM and inherited SV points." />
          <ShortcutRow keys="SV" text="Generate scroll velocity effects over a range." />
          <ShortcutRow keys="Difficulty" text="Set name, key count, HP and OD." />
          <ShortcutRow keys="Tools" text="Apply Full LN or convert holds to rice notes." />
          <ShortcutRow keys="Skin" text="Apply presets, upload .osk skins or clear the skin." />
          <ShortcutRow keys="Settings" text="Adjust the editor, playtest, audio and export options." />
        </ShortcutSection>

        <ShortcutSection title="Difficulty list">
          <ShortcutRow keys="Click difficulty" text="Switch the active difficulty." />
          <ShortcutRow keys="Ctrl + Click" text="Select several difficulties to delete at once." />
          <ShortcutRow keys="+" text="Add a new difficulty." />
          <ShortcutRow keys="Duplicate" text="Copy a difficulty with its notes and timing." />
          <ShortcutRow keys="Delete" text="Remove one or more difficulties." />
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
        title="Click to rebind"
      >
        {isCapturing ? "Press key" : editorKeyLabel(keybinds[action])}
      </button>
      <div className="text-slate-400">{text}</div>
    </div>
  );
}
