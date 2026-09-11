import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const ROOT = path.resolve(import.meta.dirname, "..");
const OSU_DIR = path.join(ROOT, ".corpus-cache", "osu");
const OUT = path.join(ROOT, "src", "lib", "mappingModel.json");

const KEY_COUNTS = [4, 5, 6, 7, 8, 9, 10];
const NPS_EDGES = [0, 3, 5, 7, 9, 12, 16, 22];
const INTERVAL_EDGES = [0.26, 0.51, 1.01];
const MAX_CHORD = 5;
const TOP_SHAPES = 24;
const MIN_NOTES = 200;

const log = (...a) => console.log(...a);
const round = (v) => Math.round(v * 10000) / 10000;
const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };
const bandOf = (nps) => { for (let i = NPS_EDGES.length - 1; i >= 0; i--) if (nps >= NPS_EDGES[i]) return i; return 0; };
const intervalClass = (beats) => { for (let i = 0; i < INTERVAL_EDGES.length; i++) if (beats <= INTERVAL_EDGES[i]) return i; return INTERVAL_EDGES.length; };
const positionClass = (phase) => (phase < 0.03 || phase > 0.97 ? 0 : Math.abs(phase - 0.5) < 0.03 ? 1 : 2);
const normalize = (arr) => { const s = arr.reduce((a, b) => a + b, 0); return arr.map((v) => round(s > 0 ? v / s : 0)); };
const quantile = (sorted, q) => { if (!sorted.length) return 0; const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.min(sorted.length - 1, lo + 1); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); };

function emptyStats(k) {
  const classes = INTERVAL_EDGES.length + 1;
  return {
    maps: 0,
    move: Array.from({ length: classes }, () => Array.from({ length: k }, () => new Array(k).fill(0))),
    column: new Array(k).fill(0),
    overlap: Array.from({ length: classes }, () => [0, 0]),
    chord: Array.from({ length: NPS_EDGES.length }, () => Array.from({ length: 3 }, () => new Array(Math.min(k, MAX_CHORD)).fill(0))),
    shapes: new Map(),
  };
}

async function main() {
  const files = (await readdir(OSU_DIR)).filter((f) => f.endsWith(".osu"));
  log(`Reading ${files.length} cached ranked difficulties…`);
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    logLevel: "error",
  });
  const { parseOsuFile, isManiaOsu } = await server.ssrLoadModule("/src/lib/osuImport.ts");
  const { toRows, monotoneRuns } = await server.ssrLoadModule("/src/lib/patternRows.ts");
  const { activeTimingAt } = await server.ssrLoadModule("/src/lib/timing.ts");
  const { analyzePatterns } = await server.ssrLoadModule("/src/lib/patternQuality.ts");

  const stats = new Map(KEY_COUNTS.map((k) => [k, emptyStats(k)]));
  const mappers = new Set();
  const repeat = [];
  let used = 0;
  for (const file of files) {
    const text = await readFile(path.join(OSU_DIR, file), "utf8");
    if (!isManiaOsu(text)) continue;
    let d;
    try { d = parseOsuFile(text).difficulty; } catch { continue; }
    const s = stats.get(d.keyCount);
    if (!s || d.notes.length < MIN_NOTES || !d.timingPoints.some((p) => p.uninherited)) continue;
    used++;
    s.maps++;
    const creator = /^\s*Creator\s*:\s*(.+)$/m.exec(text)?.[1]?.trim();
    if (creator) mappers.add(creator.toLowerCase());

    const rows = toRows(d.notes, d.keyCount);
    const span = Math.max(1, rows[rows.length - 1].time - rows[0].time);
    const band = bandOf((d.notes.length * 1000) / span);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tp = activeTimingAt(row.time, d.timingPoints);
      const beat = 60000 / tp.bpm;
      const phase = ((((row.time - tp.time) / beat) % 1) + 1) % 1;
      const size = popcount(row.mask);
      s.chord[band][positionClass(phase)][Math.min(size, s.chord[band][0].length) - 1]++;
      if (size === 1) s.column[Math.log2(row.mask)]++;
      else if (size <= MAX_CHORD) {
        const key = `${size}:${row.mask}`;
        s.shapes.set(key, (s.shapes.get(key) ?? 0) + 1);
      }
      const prev = rows[i - 1];
      if (!prev) continue;
      const ic = intervalClass((row.time - prev.time) / beat);
      s.overlap[ic][(row.mask & prev.mask) ? 0 : 1]++;
      if (size === 1 && popcount(prev.mask) === 1) s.move[ic][Math.log2(prev.mask)][Math.log2(row.mask)]++;
    }

    const runs = monotoneRuns(rows.map((r) => r.mask), d.keyCount);
    let longestBeats = 0, covered = 0;
    for (const run of runs) {
      const from = rows[run.from].time, to = rows[run.to].time;
      const beat = 60000 / activeTimingAt(from, d.timingPoints).bpm;
      longestBeats = Math.max(longestBeats, (to - from) / beat);
      covered += to - from;
    }
    const finding = analyzePatterns(d).findings.find((f) => f.rule === "repetitive-pattern");
    repeat.push({ file, keyCount: d.keyCount, longestBeats, coverage: covered / span, flagged: !!finding, findingCoverage: finding?.coverage ?? 0 });
  }
  await server.close();

  const keys = {};
  for (const [k, s] of stats) {
    if (!s.maps) continue;
    const shapes = {};
    for (let size = 2; size <= Math.min(k, MAX_CHORD); size++) {
      const list = [...s.shapes].filter(([key]) => key.startsWith(`${size}:`)).map(([key, n]) => [Number(key.split(":")[1]), n]).sort((a, b) => b[1] - a[1]).slice(0, TOP_SHAPES);
      const total = list.reduce((a, [, n]) => a + n, 0);
      if (total) shapes[size] = list.map(([mask, n]) => [mask, round(n / total)]);
    }
    keys[k] = {
      maps: s.maps,
      move: s.move.map((byPrev) => byPrev.map(normalize)),
      column: normalize(s.column),
      overlap: s.overlap.map(([hit, miss]) => round(hit + miss ? hit / (hit + miss) : 0)),
      chord: s.chord.map((byPos) => byPos.map(normalize)),
      shapes,
    };
  }
  const model = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: { difficulties: used, mappers: mappers.size },
    npsEdges: NPS_EDGES,
    intervalEdges: INTERVAL_EDGES,
    keys,
  };
  await writeFile(OUT, `${JSON.stringify(model)}\n`);
  log(`Wrote ${path.relative(ROOT, OUT)} from ${used} difficulties by ${mappers.size} mappers.`);
  for (const [k, v] of Object.entries(keys)) log(`  ${k}K: ${v.maps} maps`);

  const longest = repeat.map((r) => r.longestBeats).sort((a, b) => a - b);
  const coverage = repeat.map((r) => r.coverage).sort((a, b) => a - b);
  log("\nRepetition across ranked maps:");
  log(`  longest run (beats) p50 ${quantile(longest, 0.5).toFixed(1)} p90 ${quantile(longest, 0.9).toFixed(1)} p95 ${quantile(longest, 0.95).toFixed(1)} p99 ${quantile(longest, 0.99).toFixed(1)} max ${longest[longest.length - 1].toFixed(1)}`);
  log(`  coverage p50 ${quantile(coverage, 0.5).toFixed(3)} p90 ${quantile(coverage, 0.9).toFixed(3)} p95 ${quantile(coverage, 0.95).toFixed(3)} p99 ${quantile(coverage, 0.99).toFixed(3)}`);
  for (const beats of [8, 16, 24, 32, 48, 64]) log(`  maps with a run of ${beats}+ beats: ${(repeat.filter((r) => r.longestBeats >= beats).length / repeat.length * 100).toFixed(1)}%`);
  const flagged = repeat.filter((r) => r.flagged);
  log(`  flagged by the repetitive-pattern rule: ${flagged.length}/${repeat.length} (${(flagged.length / repeat.length * 100).toFixed(1)}%), max coverage ${Math.max(0, ...flagged.map((r) => r.findingCoverage)).toFixed(3)}`);
}

await main();
