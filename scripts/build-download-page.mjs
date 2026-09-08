import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, UI, urlFor } from "./landing-content.mjs";
import { CONTENT, SLUG } from "./download-content.mjs";

const SITE = "https://cascade.sheepex.net";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

// These pages are copied directly from public, so Vite does not bundle their fonts.
// Use the same installed fonts as the editor, including its Cyrillic fallback.
async function fontStyles() {
  const output = join(ROOT, "public", "fonts");
  await mkdir(output, { recursive: true });
  const faces = [];
  const families = {
    quicksand: ["latin", "latin-ext"],
    inter: ["cyrillic", "cyrillic-ext"],
  };
  for (const [family, subsets] of Object.entries(families)) {
    const directory = join(ROOT, "node_modules", "@fontsource", family);
    await copyFile(join(directory, "LICENSE"), join(output, family + "-LICENSE.txt"));
    for (const weight of [400, 600, 700]) {
      const css = await readFile(join(directory, weight + ".css"), "utf8");
      for (const face of css.matchAll(/@font-face \{[^}]+\}/g)) {
        const file = face[0].match(/url\(\.\/files\/([^()]+\.woff2)\)/)[1];
        const included = subsets.some(
          (subset) => file === `${family}-${subset}-${weight}-normal.woff2`,
        );
        if (!included) continue;
        await copyFile(join(directory, "files", file), join(output, file));
        faces.push(
          face[0].replace(/src: [^;]+;/, `src: url('/fonts/${file}') format('woff2');`),
        );
      }
    }
  }
  return faces.join("\n");
}

const FONT_STYLE = await fontStyles();

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function attr(value) {
  return esc(value).replace(/"/g, "&quot;");
}

function alternates() {
  const links = Object.keys(LOCALES).map(
    (code) =>
      `    <link rel="alternate" hreflang="${LOCALES[code].hreflang}" href="${SITE}${urlFor(SLUG, code)}" />`,
  );
  links.push(
    `    <link rel="alternate" hreflang="x-default" href="${SITE}${urlFor(SLUG, "en")}" />`,
  );
  return links.join("\n");
}

function ogImage(locale) {
  const prefix = LOCALES[locale].prefix;
  return `${SITE}/og${prefix ? `-${prefix}` : ""}.png?v=2`;
}

function ld(value) {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

function structured(c, url) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Cascade",
      description: c.ogDescription,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Windows 10, Windows 11",
      softwareVersion: pkg.version,
      url,
      downloadUrl: url,
      publisher: { "@type": "Organization", name: "sheepex" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Cascade", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: c.navLabel, item: url },
      ],
    },
  ];
}

const STYLE = `      :root {
        color-scheme: dark;
        --bg: #0b0b10;
        --line: #272733;
        --text: #e6e8ee;
        --muted: #9aa0ad;
        --accent: #e86868;
        --accent-soft: #f48a8a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--muted);
        font-family: "Quicksand", "Inter", ui-sans-serif, system-ui, -apple-system,
          "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
          "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }
      a { color: var(--accent-soft); text-underline-offset: 4px; }
      a:hover { color: var(--text); }
      a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-soft); outline-offset: 5px; }
      .shell { max-width: 820px; margin: 0 auto; padding: 26px 24px 40px; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
      .brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 700; font-size: 1.1rem; text-decoration: none; }
      .brand img { width: 32px; height: 32px; }
      .browser-link { color: var(--muted); font-size: 0.9rem; }
      .hero { padding: 64px 0 32px; }
      h1 { margin: 0 0 12px; color: var(--text); font-size: clamp(1.9rem, 5vw, 2.5rem); font-weight: 700; line-height: 1.2; letter-spacing: -0.035em; }
      .lead { margin: 0; font-size: 1rem; }
      .hero-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 16px 0 0; font-size: 0.8rem; }
      .release { margin: 8px 0 0; font-size: 0.8rem; }
      .downloads { border-top: 1px solid var(--line); }
      .download { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 24px; padding: 24px 0; border-bottom: 1px solid var(--line); }
      .download h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin: 0; color: var(--text); font-size: 1.1rem; font-weight: 700; }
      .kind { color: var(--muted); font-size: 0.8rem; font-weight: 400; }
      .description { margin: 4px 0 0; font-size: 0.9rem; }
      .download-action { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
      .btn { display: inline-flex; align-items: center; justify-content: center; min-width: 174px; padding: 9px 16px; border: 1px solid #33333f; border-radius: 8px; color: var(--text); background: #1d1d27; font-size: 0.9rem; font-weight: 600; text-decoration: none; transition: background 0.15s ease, border-color 0.15s ease; }
      .btn:hover { background: #272733; border-color: #44444f; }
      .btn.primary { background: var(--accent); border-color: var(--accent); color: #0b0b10; }
      .btn.primary:hover { background: var(--accent-soft); border-color: var(--accent-soft); }
      .size { margin: 0; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
      .notice { margin: 18px 0 0; color: #e8d9a8; font-size: 0.9rem; }
      .notes { margin-top: 28px; }
      .notes summary { width: fit-content; color: var(--text); cursor: pointer; font-size: 0.95rem; font-weight: 600; }
      .notes summary:hover { color: var(--accent-soft); }
      .notes-content { max-width: 640px; padding: 16px 0 4px; }
      .item + .item { margin-top: 16px; }
      .item h3 { margin: 0 0 3px; color: var(--text); font-size: 0.9rem; font-weight: 600; }
      .item p { margin: 0; font-size: 0.9rem; }
      .web { margin: 24px 0 0; font-size: 0.9rem; }
      footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 0.8rem; }
      .langs { margin: 0; line-height: 2; }
      .langs a { color: var(--muted); }
      .langs a:hover { color: var(--text); }
      .legal { margin: 6px 0 0; }
      .legal a { color: var(--muted); }
      .legal a:hover { color: var(--text); }
      @media (max-width: 600px) {
        .shell { padding: 20px 20px 32px; }
        .hero { padding: 44px 0 28px; }
        .download { grid-template-columns: 1fr; gap: 14px; padding: 22px 0; }
        .download-action { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 12px; }
        .btn { min-width: 0; }
        .browser-link { max-width: 55%; text-align: right; }
      }
      @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }`;

function download(id, c, primary) {
  const item = c.cards[id];
  return `        <article class="download">
          <div>
            <h2>${esc(item.name)} <span class="kind">${esc(item.kind)}</span></h2>
            <p class="description">${esc(item.text)}</p>
          </div>
          <div class="download-action">
            <a class="btn${primary ? " primary" : ""}" href="#" data-asset="${id}">${esc(item.cta)}</a>
            <p class="size" data-size="${id}" hidden></p>
          </div>
        </article>`;
}

function notes(list) {
  return list.map((entry) => `          <div class="item">
            <h3>${esc(entry.name)}</h3>
            <p>${esc(entry.text)}</p>
          </div>`).join("\n");
}

function langBar(locale) {
  const links = Object.keys(LOCALES)
    .filter((code) => code !== locale)
    .map(
      (code) =>
        `<a href="${urlFor(SLUG, code)}" hreflang="${LOCALES[code].hreflang}">${LOCALES[code].name}</a>`,
    )
    .join(" · ");
  return `      <p class="langs">${UI[locale].languages}: ${links}</p>`;
}

function render(locale) {
  const c = CONTENT[locale];
  const loc = LOCALES[locale];
  const url = `${SITE}${urlFor(SLUG, locale)}`;
  const home = locale === "en" ? "/" : `/${loc.prefix}`;

  return `<!doctype html>
<html lang="${loc.htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/favicon.png?v=3" />
    <link rel="canonical" href="${url}" />
${alternates()}
    <meta name="theme-color" content="#0b0b10" />
    <meta name="robots" content="index, follow" />
    <title>${esc(c.title)}</title>
    <meta name="description" content="${attr(c.description)}" />
    <meta name="keywords" content="${attr(c.keywords)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Cascade" />
    <meta property="og:locale" content="${loc.ogLocale}" />
    <meta property="og:title" content="${attr(c.ogTitle)}" />
    <meta property="og:description" content="${attr(c.ogDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${ogImage(locale)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${attr(UI[locale].ogImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${attr(c.ogTitle)}" />
    <meta name="twitter:description" content="${attr(c.ogDescription)}" />
    <meta name="twitter:image" content="${ogImage(locale)}" />
${structured(c, url)
  .map((value) => `    <script type="application/ld+json">\n${ld(value)}\n    </script>`)
  .join("\n")}
    <style>
${FONT_STYLE}
${STYLE}
    </style>
  </head>
  <body>
    <div class="shell"
      data-notice-error="${attr(c.noticeError)}"
      data-notice-empty="${attr(c.noticeEmpty)}"
      data-notice-other="${attr(c.noticeOther)}"
      data-released="${attr(c.releasedLabel)}"
    >
      <header class="top">
        <a class="brand" href="${home}">
          <img src="/favicon.png?v=3" alt="" />
          <span>Cascade</span>
        </a>
        <a class="browser-link" href="${home}">${esc(c.browserLink)}</a>
      </header>

      <main>
      <section class="hero">
        <h1>${esc(c.h1)}</h1>
        <p class="lead">${esc(c.lead)}</p>
        <p class="hero-meta">
          <span data-version>${esc(c.versionPending)}</span>
          <span aria-hidden="true">·</span>
          <span>${esc(c.specs)}</span>
        </p>
        <p class="release" data-date hidden></p>
      </section>

      <section class="downloads">
${download("setup", c, true)}
${download("msi", c, false)}
${download("portable", c, false)}
      </section>
      <p class="notice" data-notice hidden></p>

      <details class="notes">
        <summary>${esc(c.notesTitle)}</summary>
        <div class="notes-content">
${notes(c.notes)}
        </div>
      </details>

      <p class="web">${esc(c.webTitle)} <a href="${home}">${esc(c.webCta)}</a></p>
      </main>

      <footer>
${langBar(locale)}
        <p class="legal"><a href="/privacy">${esc(c.privacyLink)}</a></p>
      </footer>
    </div>
    <script src="/download.js" defer></script>
  </body>
</html>
`;
}

let written = 0;
for (const locale of Object.keys(LOCALES)) {
  const prefix = LOCALES[locale].prefix;
  const file = prefix
    ? join(ROOT, "public", prefix, `${SLUG}.html`)
    : join(ROOT, "public", `${SLUG}.html`);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, render(locale));
  written += 1;
}
console.log(`download page: ${written} files`);
