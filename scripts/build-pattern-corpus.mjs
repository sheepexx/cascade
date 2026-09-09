import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, ".corpus-cache");
const OUT = path.join(ROOT, "src", "lib", "patternCorpus.json");

const SEARCH_MIRRORS = [
  (offset, limit) => `https://catboy.best/api/v2/search?mode=3&status=1&limit=${limit}&offset=${offset}&sort=ranked_desc`,
  (offset, limit) => `https://osu.direct/api/v2/search?mode=3&status=1&limit=${limit}&offset=${offset}&sort=ranked_desc`,
];
const OSU_MIRRORS = [
  (id) => `https://osu.direct/api/osu/${id}`,
  (id) => `https://catboy.best/osu/${id}`,
];

const NPS_EDGES = [0, 3, 5, 7, 9, 12, 16, 22, Infinity];
const KEY_COUNTS = [4, 5, 6, 7, 8, 9, 10];
const WINDOW_QUANTILES = [0.5, 0.75, 0.9, 0.95, 0.99];
const SHARE_QUANTILES = [0.5, 0.75, 0.9, 0.95, 0.99];
const MIN_BUCKET_MAPS = 15;
const MIN_NOTES = 200;

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? "true"];
}));
const num = (key, fallback) => {
  const v = Number(args.get(key));
  return Number.isFinite(v) ? v : fallback;
};
const YEARS = num("years", 2);
const PER_BUCKET = num("per-bucket", 45);
const MAX_PAGES = num("max-pages", 40);
const CONCURRENCY = num("concurrency", 2);
const DRY_RUN = args.get("dry-run") === "true";

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function fetchText(urls, { json = false, retries = 4 } = {}) {
  let lastError = null;
  let throttled = false;
  for (let attempt = 0; attempt < retries; attempt++) {
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(45_000),
          headers: { "User-Agent": "cascade-pattern-corpus" },
        });
        if (res.status === 404) {
          lastError = new Error(`404 ${url}`);
          continue;
        }
        if (res.status === 403 || res.status === 429 || res.status >= 500) throttled = true;
        if (!res.ok) throw new Error(`${res.status} ${url}`);
        return json ? await res.json() : await res.text();
      } catch (err) {
        lastError = err;
      }
    }
    await sleep((throttled ? 4000 : 800) * 2 ** attempt);
  }
  throw lastError ?? new Error("unreachable");
}

async function collectCandidates() {
  const cutoff = Date.now() - YEARS * 365.25 * 24 * 3600 * 1000;
  const candidates = [];
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const cacheFile = path.join(CACHE_DIR, "search", `p${page}.json`);
    let sets;
    if (existsSync(cacheFile)) {
      sets = JSON.parse(await readFile(cacheFile, "utf8"));
    } else {
      sets = await fetchText(SEARCH_MIRRORS.map((m) => m(page * 100, 100)), { json: true });
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(sets));
      await sleep(300);
    }
    if (!Array.isArray(sets) || sets.length === 0) break;
    let oldest = Infinity;
    for (const set of sets) {
      const ranked = Date.parse(set.ranked_date ?? "");
      if (Number.isFinite(ranked)) oldest = Math.min(oldest, ranked);
      if (!Number.isFinite(ranked) || ranked < cutoff) continue;
      for (const bm of set.beatmaps ?? []) {
        if (bm.mode_int !== 3 || bm.convert) continue;
        if (!KEY_COUNTS.includes(Math.round(bm.cs))) continue;
        if (seen.has(bm.id)) continue;
        seen.add(bm.id);
        candidates.push({
          id: bm.id,
          setId: set.id,
          creatorId: set.user_id,
          keyCount: Math.round(bm.cs),
          stars: bm.difficulty_rating,
          seconds: bm.total_length,
          rankedDate: set.ranked_date,
          name: `${set.artist} - ${set.title} [${bm.version}]`,
        });
      }
    }
    const oldestLabel = Number.isFinite(oldest) ? new Date(oldest).toISOString().slice(0, 10) : "unknown";
    log(`  page ${page + 1}: ${candidates.length} mania difficulties so far (oldest ${oldestLabel})`);
    if (oldest < cutoff) break;
  }
  return candidates;
}

function starBand(stars) {
  if (!Number.isFinite(stars)) return 0;
  return Math.min(6, Math.max(0, Math.floor(stars - 1.5)));
}

function stratify(candidates) {
  const buckets = new Map();
  for (const c of candidates) {
    const key = `${c.keyCount}:${starBand(c.stars)}`;
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }
  const random = rng(0x5eed);
  const picked = [];
  for (const [key, list] of [...buckets.entries()].sort()) {
    const shuffled = list.map((c) => ({ c, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.c);
    const perCreator = new Map();
    const chosen = new Set();
    for (const cap of [2, 4, Infinity]) {
      for (const c of shuffled) {
        if (chosen.size >= PER_BUCKET) break;
        if (chosen.has(c)) continue;
        const used = perCreator.get(c.creatorId) ?? 0;
        if (used >= cap) continue;
        perCreator.set(c.creatorId, used + 1);
        chosen.add(c);
      }
      if (chosen.size >= PER_BUCKET) break;
    }
    picked.push(...chosen);
    const [keys, band] = key.split(":");
    log(`  ${keys}K star ${Number(band) + 1.5}-${Number(band) + 2.5}: ${chosen.size} of ${list.length} available`);
  }
  return picked;
}

async function downloadAll(picked) {
  await mkdir(path.join(CACHE_DIR, "osu"), { recursive: true });
  const results = new Array(picked.length).fill(null);
  let index = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    for (;;) {
      const i = index++;
      if (i >= picked.length) return;
      const c = picked[i];
      const file = path.join(CACHE_DIR, "osu", `${c.id}.osu`);
      try {
        if (existsSync(file)) {
          results[i] = await readFile(file, "utf8");
        } else {
          const text = await fetchText(OSU_MIRRORS.map((m) => m(c.id)));
          await writeFile(file, text);
          results[i] = text;
          await sleep(400);
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 25 === 0 || done === picked.length) {
        log(`  downloaded ${done}/${picked.length} (${failed} failed)`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round = (v) => Math.round(v * 10000) / 10000;

function npsBand(nps) {
  for (let i = NPS_EDGES.length - 2; i >= 0; i--) if (nps >= NPS_EDGES[i]) return i;
  return 0;
}

async function main() {
  log(`Collecting ranked mania difficulties from the last ${YEARS} years…`);
  const candidates = await collectCandidates();
  const candidateSets = new Set(candidates.map((c) => c.setId)).size;
  log(`Found ${candidates.length} candidate difficulties across ${candidateSets} mapsets.\n`);

  log(`Stratifying to at most ${PER_BUCKET} per key count and star band…`);
  const picked = stratify(candidates);
  log(`Selected ${picked.length} difficulties from ${new Set(picked.map((c) => c.setId)).size} mapsets.\n`);
  if (DRY_RUN) return;

  log("Downloading .osu files…");
  const texts = await downloadAll(picked);

  log("\nExtracting pattern windows…");
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    logLevel: "error",
  });
  const { parseOsuFile, isManiaOsu } = await server.ssrLoadModule("/src/lib/osuImport.ts");
  const { analyzePatterns, WINDOW_FEATURE_KEYS } = await server.ssrLoadModule("/src/lib/patternQuality.ts");

  const maps = [];
  let skipped = 0;
  for (let i = 0; i < picked.length; i++) {
    const text = texts[i];
    if (!text || !isManiaOsu(text)) {
      skipped++;
      continue;
    }
    try {
      const parsed = parseOsuFile(text);
      const d = parsed.difficulty;
      if (d.keyCount !== picked[i].keyCount || d.notes.length < MIN_NOTES) {
        skipped++;
        continue;
      }
      const { windows } = analyzePatterns(d);
      if (windows.length < 8) {
        skipped++;
        continue;
      }
      const npsSorted = windows.map((w) => w.nps).sort((a, b) => a - b);
      maps.push({ meta: picked[i], windows, medianNps: quantile(npsSorted, 0.5) });
    } catch {
      skipped++;
    }
    if ((i + 1) % 50 === 0) log(`  analysed ${i + 1}/${picked.length}`);
  }
  await server.close();
  log(`Analysed ${maps.length} difficulties (${skipped} skipped).\n`);

  const grouped = new Map();
  for (const m of maps) {
    const key = `${m.meta.keyCount}:${npsBand(m.medianNps)}`;
    const list = grouped.get(key);
    if (list) list.push(m);
    else grouped.set(key, [m]);
  }

  const buckets = [];
  for (const keyCount of KEY_COUNTS) {
    for (let band = 0; band < NPS_EDGES.length - 1; band++) {
      const exact = grouped.get(`${keyCount}:${band}`) ?? [];
      if (exact.length === 0) continue;
      let sample = exact;
      for (let spread = 1; sample.length < MIN_BUCKET_MAPS && spread < NPS_EDGES.length; spread++) {
        sample = [];
        for (let b = band - spread; b <= band + spread; b++) {
          sample.push(...(grouped.get(`${keyCount}:${b}`) ?? []));
        }
      }
      if (sample.length < MIN_BUCKET_MAPS) continue;

      const windowQuantiles = {};
      const extremeQuantiles = {};
      for (const key of WINDOW_FEATURE_KEYS) {
        const values = sample.flatMap((m) => m.windows.map((w) => w[key])).sort((a, b) => a - b);
        windowQuantiles[key] = WINDOW_QUANTILES.map((q) => round(quantile(values, q)));
        const threshold = quantile(values, 0.95);
        const shares = sample
          .map((m) => m.windows.filter((w) => w[key] > threshold).length / m.windows.length)
          .sort((a, b) => a - b);
        extremeQuantiles[key] = SHARE_QUANTILES.map((q) => round(quantile(shares, q)));
      }
      const stars = sample.map((m) => m.meta.stars).filter(Number.isFinite).sort((a, b) => a - b);
      buckets.push({
        keyCount,
        band,
        npsMin: NPS_EDGES[band],
        npsMax: NPS_EDGES[band + 1] === Infinity ? null : NPS_EDGES[band + 1],
        maps: sample.length,
        exactMaps: exact.length,
        windows: sample.reduce((a, m) => a + m.windows.length, 0),
        starMin: round(quantile(stars, 0.05)),
        starMax: round(quantile(stars, 0.95)),
        windowQuantiles,
        extremeQuantiles,
      });
    }
  }

  const dates = maps.map((m) => m.meta.rankedDate).filter(Boolean).sort();
  const corpus = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    quantiles: WINDOW_QUANTILES,
    shareQuantiles: SHARE_QUANTILES,
    source: {
      difficulties: maps.length,
      mapsets: new Set(maps.map((m) => m.meta.setId)).size,
      mappers: new Set(maps.map((m) => m.meta.creatorId)).size,
      rankedFrom: (dates[0] ?? "").slice(0, 10),
      rankedTo: (dates[dates.length - 1] ?? "").slice(0, 10),
    },
    buckets,
  };
  await writeFile(OUT, `${JSON.stringify(corpus, null, 1)}\n`);

  log(`Wrote ${path.relative(ROOT, OUT)}`);
  log(`  ${corpus.source.difficulties} difficulties, ${corpus.source.mapsets} mapsets, ${corpus.source.mappers} mappers`);
  log(`  ranked ${corpus.source.rankedFrom} to ${corpus.source.rankedTo}`);
  log(`  ${buckets.length} usable buckets:`);
  for (const b of buckets) {
    log(`    ${b.keyCount}K nps ${b.npsMin}-${b.npsMax ?? "+"}: ${b.exactMaps} exact / ${b.maps} pooled maps, ${b.windows} windows, ${b.starMin}-${b.starMax} stars`);
  }
}

await main();
