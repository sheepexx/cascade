
import { readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import JSZip from "jszip";
// The app's own calculator (a port of osu!'s), so the listed stars match what
// the editor shows. Node runs the TypeScript file directly.
import { computeStarRating } from "../src/lib/starRating.ts";

const run = promisify(execFile);

const BANNER_WIDTH = 800;
const BANNER_QUALITY = 82;

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
  // Same-time notes keep the file's order, which osu!'s star rating depends on.
  notes.sort((a, b) => a.startTime - b.startTime);

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

async function downscaleBanner(src, dst) {
  const script = `
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile('${src}')
$w=[math]::Min(${BANNER_WIDTH}, $img.Width)
$h=[int][math]::Round($img.Height*($w/$img.Width))
$bmp=New-Object System.Drawing.Bitmap($w,$h)
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.DrawImage($img,0,0,$w,$h)
$g.Dispose(); $img.Dispose()
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$prm=New-Object System.Drawing.Imaging.EncoderParameters(1)
$prm.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,${BANNER_QUALITY}L)
$bmp.Save('${dst}',$enc,$prm)
$bmp.Dispose()`;
  await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
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
        const rawName = `${slug}-banner-source${ext.toLowerCase()}`;
        const rawPath = join(OUT_DIR, rawName);
        const imgBuf = await entry.async("nodebuffer");
        await writeFile(rawPath, imgBuf);
        bannerName = `${slug}-banner.jpg`;
        try {
          await downscaleBanner(rawPath, join(OUT_DIR, bannerName));
          await rm(rawPath, { force: true });
        } catch {
          console.warn(`  banner downscale failed, keeping full size: ${file}`);
          bannerName = rawName;
        }
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
