import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCALES,
  PAGES as LANDING_PAGES,
  urlFor,
} from "./landing-content.mjs";

const SITE = "https://cascade.sheepex.net";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const GENERATED = LANDING_PAGES.flatMap((page) =>
  Object.keys(LOCALES).map((locale) => ({
    path: urlFor(page.slug, locale),
    source: "scripts/landing-content.mjs",
    priority: locale === "en" ? "0.7" : "0.5",
    changefreq: "monthly",
  })),
);

const PAGES = [
  { path: "/", source: "index.html", priority: "1.0", changefreq: "weekly" },
  {
    path: "/how-to-make-an-osu-mania-map",
    source: "public/how-to-make-an-osu-mania-map.html",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-to-stepmania",
    source: "public/osu-to-stepmania.html",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-mania-map-viewer",
    source: "public/osu-mania-map-viewer.html",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-mania-pack-creator",
    source: "public/osu-mania-pack-creator.html",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-mania-sv-editor",
    source: "public/osu-mania-sv-editor.html",
    priority: "0.7",
    changefreq: "monthly",
  },
  ...GENERATED,
  {
    path: "/privacy",
    source: "public/privacy.html",
    priority: "0.3",
    changefreq: "yearly",
  },
];

const today = new Date().toISOString().slice(0, 10);

function lastModified(source) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cs", "--", source],
      { encoding: "utf8", cwd: ROOT },
    ).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    return today;
  }
  return today;
}

const urls = PAGES.map(
  (page) => `  <url>
    <loc>${SITE}${page.path}</loc>
    <lastmod>${lastModified(page.source)}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
).join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

await writeFile(join(ROOT, "dist", "sitemap.xml"), xml);
console.log(`sitemap: ${PAGES.length} urls`);
