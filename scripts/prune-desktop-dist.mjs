import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";

const DROP_DIRS = ["maps", "shots", "de", "ru", "zh-cn", "pt-br"];
const DROP_FILES = [
  "sitemap.xml",
  "robots.txt",
  "sw.js",
  "sw.js.map",
  "registerSW.js",
];
const DROP_PATTERNS = [/^og.*\.png$/, /^workbox-.*\.js$/, /\.html$/];

const KEEP_HTML = new Set(["index.html"]);

async function sizeOf(path) {
  const entry = await stat(path);
  if (!entry.isDirectory()) return entry.size;
  let total = 0;
  for (const name of await readdir(path)) total += await sizeOf(join(path, name));
  return total;
}

const before = await sizeOf(DIST);
const dropped = [];

for (const dir of DROP_DIRS) {
  const path = join(DIST, dir);
  try {
    await rm(path, { recursive: true, force: true });
    dropped.push(dir + "/");
  } catch {
    /* not present */
  }
}

for (const name of await readdir(DIST)) {
  if (KEEP_HTML.has(name)) continue;
  const drop =
    DROP_FILES.includes(name) || DROP_PATTERNS.some((re) => re.test(name));
  if (!drop) continue;
  await rm(join(DIST, name), { recursive: true, force: true });
  dropped.push(name);
}

const after = await sizeOf(DIST);
const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";
console.log(
  `desktop dist: ${mb(before)} -> ${mb(after)} (removed ${dropped.length} entries)`,
);
