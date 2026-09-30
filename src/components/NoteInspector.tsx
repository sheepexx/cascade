import { useEffect, useState } from "react";
import type { ManiaNote } from "../types";
import { formatAiModTime } from "../lib/aimod";
import { gapBefore } from "../lib/noteGaps";
import { useT } from "../lib/i18n";

/**
 * What the selection is, after osu!lazer's object inspector: one note's exact
 * timing, editable, or the extent of several.
 */
export function NoteInspector({
  selected,
  notes,
  readOnly,
  onRetime,
}: {
  selected: ManiaNote[];
  notes: ManiaNote[];
  readOnly: boolean;
  /** Returns false when the change was refused (overlap or out of the song). */
  onRetime: (note: ManiaNote) => boolean;
}) {
  const t = useT();
  if (!selected.length) return null;

  if (selected.length > 1) {
    let start = Infinity;
    let end = -Infinity;
    const lanes = new Set<number>();
    for (const n of selected) {
      start = Math.min(start, n.startTime);
      end = Math.max(end, n.endTime ?? n.startTime);
      lanes.add(n.column + 1);
    }
    return (
      <Panel title={t("inspector.selection")}>
        <Row label={t("inspector.notes")} value={String(selected.length)} />
        <Row label={t("inspector.span")} value={`${formatAiModTime(start)} – ${formatAiModTime(end)}`} />
        <Row label={t("inspector.duration")} value={`${Math.round(end - start)} ms`} />
        <Row label={t("inspector.lanes")} value={[...lanes].sort((a, b) => a - b).join(", ")} />
      </Panel>
    );
  }

  const note = selected[0];
  const gap = gapBefore(note, notes);
  const isHold = note.endTime !== undefined && note.endTime > note.startTime;

  return (
    <Panel title={isHold ? t("inspector.hold") : t("inspector.note")}>
      <TimeRow
        label={t("inspector.start")}
        value={note.startTime}
        readOnly={readOnly}
        onCommit={(ms) => {
          const shift = ms - note.startTime;
          return onRetime({
            ...note,
            startTime: ms,
            ...(isHold ? { endTime: (note.endTime as number) + shift } : {}),
          });
        }}
      />
      {isHold && (
        <>
          <TimeRow
            label={t("inspector.end")}
            value={note.endTime as number}
            readOnly={readOnly}
            onCommit={(ms) => ms > note.startTime && onRetime({ ...note, endTime: ms })}
          />
          <Row
            label={t("inspector.length")}
            value={`${Math.round((note.endTime as number) - note.startTime)} ms`}
          />
        </>
      )}
      <Row label={t("inspector.lane")} value={String(note.column + 1)} />
      <Row
        label={t("inspector.gap")}
        value={gap === null ? "–" : `${Math.round(gap)} ms`}
      />
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute left-3 top-14 z-10 w-48 select-none rounded-lg border border-ink-600 bg-ink-800/90 p-2 text-xs text-slate-300 shadow-xl backdrop-blur">
      <div className="mb-1.5 font-medium text-slate-200">{title}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-200">{value}</span>
    </div>
  );
}

/** A time in whole milliseconds, typed and committed on Enter or leaving the field. */
function TimeRow({
  label,
  value,
  readOnly,
  onCommit,
}: {
  label: string;
  value: number;
  readOnly: boolean;
  onCommit: (ms: number) => boolean;
}) {
  const t = useT();
  const shown = String(Math.round(value));
  const [text, setText] = useState(shown);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    setText(shown);
    setRefused(false);
  }, [shown]);

  const commit = () => {
    const ms = Math.round(Number(text));
    if (!text.trim() || !Number.isFinite(ms) || ms === Math.round(value)) {
      setText(shown);
      setRefused(false);
      return;
    }
    const accepted = onCommit(ms);
    setRefused(!accepted);
    if (!accepted) setText(shown);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-1">
        <input
          value={text}
          readOnly={readOnly}
          inputMode="numeric"
          aria-label={label}
          title={refused ? t("inspector.refused") : formatAiModTime(value)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // The editor's own shortcuts shouldn't fire while typing a time.
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setText(shown);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`w-16 rounded border bg-ink-700/70 px-1.5 py-0.5 text-right tabular-nums text-slate-100 outline-none focus:border-accent/70 ${
            refused ? "border-rose-400/70" : "border-white/10"
          }`}
        />
        <span className="text-slate-500">ms</span>
      </span>
    </div>
  );
}
