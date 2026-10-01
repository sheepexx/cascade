import { describe, it } from "vitest";
import { stressChart } from "./stressChart";
import { applyNoteOp } from "../ops";
import { hasNoteCollisions, placementFor, withoutNoteCollisions } from "../noteCollision";
import { computeStarRating } from "../starRating";
import { countUnsnapped, runAiMod } from "../aimod";
import { computeMapStats } from "../mapStats";
import { computeNpsSeries } from "../nps";
import { buildOsuFile } from "../osuExport";
import { parseOsuFile } from "../osuImport";
import { validateProject } from "../validation";
import { packNotes } from "../recovery";
import { DEFAULT_SONG_META, type Difficulty, type ManiaNote } from "../../types";

/**
 * How Cascade's per-edit, import and export work scales with chart size.
 * Not part of `npm test`: run `npm run perf` and read the table. Each figure
 * is the median of several runs, in milliseconds.
 */

const SIZES = [10_000, 50_000, 100_000];

function median(run: () => unknown, repeat: number): number {
  const times: number[] = [];
  run(); // warm the JIT
  for (let i = 0; i < repeat; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

type Row = { name: string; when: string; times: number[] };

describe("editor work at scale", () => {
  it("prints a timing table", { timeout: 600_000 }, () => {
    const rows = new Map<string, Row>();
    const record = (name: string, when: string, ms: number) => {
      const row = rows.get(name) ?? { name, when, times: [] };
      row.times.push(ms);
      rows.set(name, row);
    };

    for (const size of SIZES) {
      const { difficulty, timingPoints } = stressChart(size);
      const difficulties: Difficulty[] = [difficulty];
      const notes = difficulty.notes;
      const repeat = size >= 100_000 ? 5 : 9;
      const newNote: ManiaNote = { id: "fresh", column: 3, startTime: notes[Math.floor(size / 2)].startTime + 7 };
      const selection = notes.slice(Math.floor(size / 2), Math.floor(size / 2) + 32);
      const moved = selection.map((n) => ({ ...n, startTime: n.startTime + 1000 }));

      record("Add one note (applyNoteOp)", "every placement", median(() => applyNoteOp(difficulties, { t: "note.add", diffId: difficulty.id, notes: [newNote] }), repeat));
      record("Move 32 notes (applyNoteOp)", "every drag", median(() => applyNoteOp(difficulties, { t: "note.update", diffId: difficulty.id, before: selection, after: moved }), repeat));
      record("Placement check (placementFor)", "every placement", median(() => placementFor(newNote, notes), repeat));
      record("Collision check, whole difficulty", "every move", median(() => hasNoteCollisions(notes), repeat));
      record("Paste 32 notes (withoutNoteCollisions)", "every paste", median(() => withoutNoteCollisions(moved, notes), repeat));
      record("Editor sort of the notes", "every edit", median(() => [...notes].sort((a, b) => a.startTime - b.startTime), repeat));
      record("Notes by id (Map)", "first key press of a playtest", median(() => new Map(notes.map((n) => [n.id, n])), repeat));
      // A fresh array each run: an edit replaces the notes, so this is the
      // cost once per edit (deferred behind the playfield's own render).
      record("Star rating, edited difficulty", "once per edit, deferred", median(() => computeStarRating(notes.slice(), difficulty.keyCount), repeat));
      record("Star rating, untouched difficulty", "every edit (cached)", median(() => computeStarRating(notes, difficulty.keyCount), repeat));
      record("Map stats, edited difficulty", "once per edit, deferred", median(() => computeMapStats(notes.slice(), difficulty.keyCount), repeat));
      record("Unsnapped count", "with AiMod open", median(() => countUnsnapped(notes, timingPoints), repeat));
      record("NPS series", "every edit", median(() => computeNpsSeries(notes), repeat));
      record("Recovery copy, note objects (before)", "edit pause", median(() => structuredClone(difficulty), repeat));
      record("Recovery copy, packed (now)", "edit pause", median(() => structuredClone({ ...difficulty, notes: [], packedNotes: packNotes(difficulty.notes) }), repeat));
      const text = buildOsuFile({ meta: DEFAULT_SONG_META, difficulty, timingPoints, audioFilename: "audio.mp3" });
      record(".osu export (buildOsuFile)", "export", median(() => buildOsuFile({ meta: DEFAULT_SONG_META, difficulty, timingPoints, audioFilename: "audio.mp3" }), repeat));
      record(".osu import (parseOsuFile)", "import", median(() => parseOsuFile(text), repeat));
      record("Export validation", "export", median(() => validateProject({ meta: DEFAULT_SONG_META, difficulties, audioFiles: {}, bgFiles: {} }), repeat));
      record("AiMod report", "AiMod open", median(() => runAiMod({ meta: DEFAULT_SONG_META, difficulties, audioFiles: {}, bgFiles: {} }), Math.min(repeat, 3)));
    }

    const header = `| Operation | Runs on | ${SIZES.map((s) => `${s / 1000}k notes`).join(" | ")} |`;
    const divider = `| --- | --- | ${SIZES.map(() => "---:").join(" | ")} |`;
    const body = [...rows.values()].map(
      (row) => `| ${row.name} | ${row.when} | ${row.times.map((t) => t.toFixed(t < 10 ? 2 : 1)).join(" | ")} |`,
    );
    console.log(["", header, divider, ...body, ""].join("\n"));
  });
});
