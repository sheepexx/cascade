
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const SOURCE_DIR = process.argv[2] ?? "C:\\Users\\noahe\\Downloads\\maps";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "public", "maps");

function splitSections(text) {
  const sections = {};
  let current = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      current = header[1];
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return sections;
}

function keyValues(lines = []) {
  const out = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

const num = (v, fb) => (Number.isFinite(Number(v)) ? Number(v) : fb);

function xToColumn(x, keyCount) {
  const col = Math.floor((x * keyCount) / 512);
  return Math.max(0, Math.min(keyCount - 1, col));
}

function parseOsu(text) {
  const sections = splitSections(text);
  const general = keyValues(sections["General"]);
  const meta = keyValues(sections["Metadata"]);
  const diff = keyValues(sections["Difficulty"]);

  const keyCount = Math.max(1, Math.min(18, Math.round(num(diff["CircleSize"], 4))));

  let background = null;
  for (const line of sections["Events"] ?? []) {
    const m = line.match(/^0\s*,\s*0\s*,\s*"?([^",]+)"?/);
    if (m) {
      background = m[1];
      break;
    }
  }

  const notes = [];
  for (const line of sections["HitObjects"] ?? []) {
    const p = line.split(",");
    if (p.length < 4) continue;
    const x = Number(p[0]);
    const time = Math.round(Number(p[2]));
    const type = Number(p[3]);
    if (!Number.isFinite(x) || !Number.isFinite(time)) continue;
    const column = xToColumn(x, keyCount);
    if (type & 128) {
      const param = p[5] ?? "";
      const colon = param.indexOf(":");
      const endRaw = colon === -1 ? param : param.slice(0, colon);
      const endTime = Math.round(Number(endRaw));
      notes.push({
        column,
        startTime: time,
        endTime: Number.isFinite(endTime) && endTime > time ? endTime : time + 1,
      });
    } else {
      notes.push({ column, startTime: time, endTime: null });
    }
  }
  notes.sort((a, b) => a.startTime - b.startTime || a.column - b.column);

  return {
    mode: Number(general["Mode"] ?? 0),
    version: meta["Version"] ?? "Imported",
    title: meta["Title"] ?? meta["TitleUnicode"] ?? "Untitled",
    artist: meta["Artist"] ?? meta["ArtistUnicode"] ?? "Unknown Artist",
    creator: meta["Creator"] ?? "Mapper",
    keyCount,
    background,
    notes,
  };
}

const SECTION_MS = 400;
const INDIVIDUAL_DECAY_BASE = 0.125;
const OVERALL_DECAY_BASE = 0.3;
const RELEASE_THRESHOLD = 30;
const LOGISTIC_MULTIPLIER = 0.27;
const DECAY_WEIGHT = 0.9;
const DIFFICULTY_MULTIPLIER = 0.018;

const applyDecay = (value, deltaMs, base) => value * Math.pow(base, deltaMs / 1000);
const definitelyBigger = (a, b) => a > b + 1;
const logistic = (x, midpoint, mult) => 1 / (1 + Math.exp(mult * (midpoint - x)));

function computeStarRating(notes, keyCount) {
  if (notes.length < 2 || keyCount <= 0) return 0;

  const objs = notes
    .map((n) => ({
      start: n.startTime,
      end: n.endTime ?? n.startTime,
      col: Math.max(0, Math.min(keyCount - 1, n.column)),
    }))
    .sort((a, b) => a.start - b.start || a.col - b.col);

  const individualStrains = new Array(keyCount).fill(0);
  const startTimes = new Array(keyCount).fill(0);
  const endTimes = new Array(keyCount).fill(0);
  const hasPrev = new Array(keyCount).fill(false);
  let highestIndividualStrain = 0;
  let overallStrain = 1;
  let currentStrain = 0;
  let prevStart = objs[0].start;

  const strainValueOf = (cur, deltaTime) => {
    const { start, end, col } = cur;

    let individualHoldFactor = 1.0;
    for (let i = 0; i < keyCount; i++) {
      if (!hasPrev[i]) continue;
      if (definitelyBigger(endTimes[i], end) && definitelyBigger(start, startTimes[i]))
        individualHoldFactor = 1.25;
    }

    let overallHoldFactor = 1.0;
    let isOverlapping = false;
    let closestEnd = Math.abs(end - start);
    for (let i = 0; i < keyCount; i++) {
      if (!hasPrev[i]) continue;
      isOverlapping ||=
        definitelyBigger(endTimes[i], start) && definitelyBigger(end, endTimes[i]);
      if (definitelyBigger(endTimes[i], end)) overallHoldFactor = 1.25;
      closestEnd = Math.min(closestEnd, Math.abs(end - endTimes[i]));
    }
    const holdAddition = isOverlapping
      ? logistic(closestEnd, RELEASE_THRESHOLD, LOGISTIC_MULTIPLIER)
      : 0;

    individualStrains[col] = applyDecay(
      individualStrains[col],
      start - startTimes[col],
      INDIVIDUAL_DECAY_BASE,
    );
    individualStrains[col] += 2.0 * individualHoldFactor;

    highestIndividualStrain =
      deltaTime <= 1
        ? Math.max(highestIndividualStrain, individualStrains[col])
        : individualStrains[col];

    overallStrain = applyDecay(overallStrain, deltaTime, OVERALL_DECAY_BASE);
    overallStrain += (1 + holdAddition) * overallHoldFactor;

    startTimes[col] = start;
    endTimes[col] = end;
    hasPrev[col] = true;
    return highestIndividualStrain + overallStrain - currentStrain;
  };

  const initialStrain = (time) =>
    applyDecay(highestIndividualStrain, time - prevStart, INDIVIDUAL_DECAY_BASE) +
    applyDecay(overallStrain, time - prevStart, OVERALL_DECAY_BASE);

  const peaks = [];
  let sectionPeak = 0;
  let sectionEnd = 0;
  let started = false;

  for (let i = 1; i < objs.length; i++) {
    const cur = objs[i];
    const deltaTime = cur.start - objs[i - 1].start;

    if (!started) {
      sectionEnd = Math.ceil(cur.start / SECTION_MS) * SECTION_MS;
      started = true;
    }
    while (cur.start > sectionEnd) {
      peaks.push(sectionPeak);
      sectionPeak = initialStrain(sectionEnd);
      sectionEnd += SECTION_MS;
    }

    currentStrain += strainValueOf(cur, deltaTime);
    sectionPeak = Math.max(sectionPeak, currentStrain);
    prevStart = cur.start;
  }
  peaks.push(sectionPeak);

  const sortedPeaks = peaks.filter((p) => p > 0).sort((a, b) => b - a);
  let difficulty = 0;
  let weight = 1;
  for (const peak of sortedPeaks) {
    difficulty += peak * weight;
    weight *= DECAY_WEIGHT;
  }

  return difficulty * DIFFICULTY_MULTIPLIER;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\.osz$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function findEntry(zip, name) {
  if (!name) return null;
  const target = name.toLowerCase();
  let found = null;
  zip.forEach((path, file) => {
    if (found) return;
    const base = path.split("/").pop()?.toLowerCase();
    if (base === target || path.toLowerCase() === target) found = file;
  });
  return found;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(SOURCE_DIR)).filter((f) => f.toLowerCase().endsWith(".osz"));
  if (files.length === 0) {
    console.error(`No .osz files found in ${SOURCE_DIR}`);
    process.exit(1);
  }

  const manifest = [];

  for (const file of files) {
    const buf = await readFile(join(SOURCE_DIR, file));
    const zip = await JSZip.loadAsync(buf);

    const osuPaths = [];
    zip.forEach((path) => {
      if (path.toLowerCase().endsWith(".osu")) osuPaths.push(path);
    });
    osuPaths.sort();

    const diffs = [];
    for (const path of osuPaths) {
      const text = await zip.file(path).async("string");
      const parsed = parseOsu(text);
      if (parsed.mode !== 3) continue;
      diffs.push(parsed);
    }
    if (diffs.length === 0) {
      console.warn(`Skipping (no mania difficulties): ${file}`);
      continue;
    }

    const slug = slugify(file);
    const oszName = `${slug}.osz`;
    await writeFile(join(OUT_DIR, oszName), buf);

    let bannerName = null;
    const withBg = diffs.find((d) => d.background) ?? diffs[0];
    if (withBg.background) {
      const entry = findEntry(zip, withBg.background);
      if (entry) {
        const ext = extname(withBg.background) || ".jpg";
        bannerName = `${slug}-banner${ext.toLowerCase()}`;
        const imgBuf = await entry.async("nodebuffer");
        await writeFile(join(OUT_DIR, bannerName), imgBuf);
      }
    }

    const difficulties = diffs
      .map((d) => ({
        name: d.version,
        keyCount: d.keyCount,
        stars: Math.round(computeStarRating(d.notes, d.keyCount) * 100) / 100,
      }))
      .sort((a, b) => a.stars - b.stars);

    const first = diffs[0];
    manifest.push({
      id: slug,
      title: first.title,
      artist: first.artist,
      creator: first.creator,
      osz: `maps/${oszName}`,
      banner: bannerName ? `maps/${bannerName}` : null,
      difficulties,
    });

    console.log(`✓ ${first.artist} - ${first.title} (${difficulties.length} diff)`);
  }

  manifest.sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifest.length} maps to ${join(OUT_DIR, "manifest.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
