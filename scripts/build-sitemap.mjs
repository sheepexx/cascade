import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCALES,
  PAGES as LANDING_PAGES,
  urlFor,
} from "./landing-content.mjs";
import { SLUG as DOWNLOAD_SLUG } from "./download-content.mjs";

const SITE = "https://cascade.sheepex.net";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const HOME_UPDATED = "2026-08-12";

const GENERATED = LANDING_PAGES.flatMap((page) =>
  Object.keys(LOCALES).map((locale) => ({
    path: urlFor(page.slug, locale),
    updated: page.updated,
    priority: locale === "en" ? "0.7" : "0.5",
    changefreq: "monthly",
  })),
);

const LOCALISED_HOMES = Object.keys(LOCALES)
  .filter((locale) => LOCALES[locale].prefix)
  .map((locale) => ({
    path: `/${LOCALES[locale].prefix}`,
    updated: HOME_UPDATED,
    priority: "0.8",
    changefreq: "weekly",
  }));

const DOWNLOAD = Object.keys(LOCALES).map((locale) => ({
  path: urlFor(DOWNLOAD_SLUG, locale),
  updated: "2026-09-08",
  priority: locale === "en" ? "0.8" : "0.6",
  changefreq: "weekly",
}));

const PAGES = [
  { path: "/", updated: HOME_UPDATED, priority: "1.0", changefreq: "weekly" },
  ...LOCALISED_HOMES,
  ...DOWNLOAD,
  {
    path: "/how-to-make-an-osu-mania-map",
    updated: "2026-08-12",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-to-stepmania",
    updated: "2026-08-12",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-mania-map-viewer",
    updated: "2026-08-12",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-mania-pack-creator",
    updated: "2026-08-12",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/osu-mania-sv-editor",
    updated: "2026-08-12",
    priority: "0.7",
    changefreq: "monthly",
  },
  ...GENERATED,
  {
    path: "/privacy",
    updated: "2026-08-07",
    priority: "0.3",
    changefreq: "yearly",
  },
  {
    path: "/terms",
    updated: "2026-09-10",
    priority: "0.3",
    changefreq: "yearly",
  },
];

for (const page of PAGES) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(page.updated ?? "")) {
    throw new Error(`build-sitemap: ${page.path} needs an updated date`);
  }
}

const urls = PAGES.map(
  (page) => `  <url>
    <loc>${SITE}${page.path}</loc>
    <lastmod>${page.updated}</lastmod>
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
