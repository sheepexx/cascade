import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCS_GROUPS,
  ENGLISH_DOCS,
  LOCALES,
  PAGES,
  UI,
  docsHubUrl,
  docsUrl,
  urlFor,
} from "./landing-content.mjs";
import {
  CONTENT as DOWNLOAD,
  SLUG as DOWNLOAD_SLUG,
} from "./download-content.mjs";
import { fontStyles, PAGE_FONT_FAMILY } from "./page-fonts.mjs";

const SITE = "https://cascade.sheepex.net";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FONT_STYLE = await fontStyles();

/** public/docs/<slug>.html, or public/<prefix>/docs/<slug>.html. */
function fileFor(slug, locale) {
  const prefix = LOCALES[locale].prefix;
  return prefix
    ? join(ROOT, "public", prefix, "docs", `${slug}.html`)
    : join(ROOT, "public", "docs", `${slug}.html`);
}

/** public/docs.html, or public/<prefix>/docs.html. */
function hubFileFor(locale) {
  const prefix = LOCALES[locale].prefix;
  return prefix
    ? join(ROOT, "public", prefix, "docs.html")
    : join(ROOT, "public", "docs.html");
}

function alternates(urlOf) {
  const links = Object.keys(LOCALES).map(
    (code) =>
      `    <link rel="alternate" hreflang="${LOCALES[code].hreflang}" href="${SITE}${urlOf(code)}" />`,
  );
  links.push(
    `    <link rel="alternate" hreflang="x-default" href="${SITE}${urlOf("en")}" />`,
  );
  return links.join("\n");
}

function ogImage(page, locale) {
  if (page.ogImage) return page.ogImage;
  const prefix = LOCALES[locale].prefix;
  return {
    path: `/og${prefix ? `-${prefix}` : ""}.png?v=2`,
    width: 1200,
    height: 630,
  };
}

function breadcrumb(slug, locale, label) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Cascade", item: `${SITE}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: UI[locale].docs,
        item: `${SITE}${docsHubUrl(locale)}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: label,
        item: `${SITE}${docsUrl(slug, locale)}`,
      },
    ],
  };
}

function ld(value) {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

const STYLE = `      :root { color-scheme: dark; }
      body {
        margin: 0;
        background: #0b0b10;
        color: #9aa0ad;
        font-family: ${PAGE_FONT_FAMILY};
        line-height: 1.65;
      }
      main { max-width: 680px; margin: 0 auto; padding: 40px 20px 64px; }
      header { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
      header img { width: 34px; height: 34px; border-radius: 9px; }
      header a { color: #cfd2dc; font-weight: 700; text-decoration: none; font-size: 1.05rem; }
      h1 { margin: 0 0 14px; font-size: 1.5rem; font-weight: 700; color: #e6e8ee; }
      h2 { margin: 30px 0 10px; font-size: 1.05rem; color: #cfd2dc; }
      p { margin: 0 0 10px; }
      ol, ul { margin: 0 0 10px; padding-left: 22px; }
      li { margin: 4px 0; }
      code { padding: 1px 6px; border-radius: 5px; background: #1d1d27; color: #cfd2dc; font-size: 0.88em; }
      a { color: #f48a8a; }
      .cta {
        display: inline-block; margin: 18px 0 6px; padding: 11px 22px;
        border-radius: 10px; background: #f45a5a; color: #fff; font-weight: 600;
        text-decoration: none;
      }
      .cta:hover { background: #f47070; }
      .note {
        margin: 14px 0; padding: 10px 14px; border-radius: 10px;
        border: 1px solid rgba(251, 191, 36, 0.25); background: rgba(251, 191, 36, 0.08);
        color: #e8d9a8; font-size: 0.9rem;
      }
      figure { margin: 22px 0 18px; }
      figure img { display: block; width: 100%; height: auto; border-radius: 16px; }
      figcaption { margin-top: 8px; font-size: 0.85rem; color: #767c8a; }
      .langs { margin: 26px 0 0; font-size: 0.85rem; }
      .langs a { color: #9aa0ad; }
      footer { margin-top: 44px; padding-top: 18px; border-top: 1px solid #1d1d27; font-size: 0.85rem; }
      footer a { color: #9aa0ad; }`;

function langBar(slug, locale) {
  const items = Object.keys(LOCALES)
    .filter((code) => code !== locale)
    .map(
      (code) =>
        `<a href="${slug ? docsUrl(slug, code) : docsHubUrl(code)}" hreflang="${LOCALES[code].hreflang}">${LOCALES[code].name}</a>`,
    )
    .join(" · ");
  return `      <p class="langs">${UI[locale].languages}: ${items}</p>`;
}

function footerLinks(slug, locale) {
  const home = `<a href="/">${UI[locale].home}</a>`;
  const hub = `<a href="${docsHubUrl(locale)}">${UI[locale].docs}</a>`;
  const others = PAGES.filter((p) => p.slug !== slug).map(
    (p) => `<a href="${docsUrl(p.slug, locale)}">${p.content[locale].navLabel}</a>`,
  );
  const legacy = UI[locale].legacy.map(
    (l) => `<a href="${l.href}">${l.label}</a>`,
  );
  const download = `<a href="${urlFor(DOWNLOAD_SLUG, locale)}">${DOWNLOAD[locale].navLabel}</a>`;
  return [home, hub, ...others, ...legacy, download].join(" ·\n          ");
}

function render(page, locale) {
  const c = page.content[locale];
  const loc = LOCALES[locale];
  const url = `${SITE}${docsUrl(page.slug, locale)}`;
  const structured = page.structured?.(c, url);
  const og = ogImage(page, locale);
  const ogAlt = c.ogImageAlt ?? UI[locale].ogImageAlt;

  return `<!doctype html>
<html lang="${loc.htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/favicon.png?v=3" />
    <link rel="canonical" href="${url}" />
${alternates((code) => docsUrl(page.slug, code))}
    <meta name="theme-color" content="#0b0d12" />
    <meta name="robots" content="index, follow" />
    <title>${c.title}</title>
    <meta name="description" content="${c.description}" />
    <meta name="keywords" content="${c.keywords}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Cascade" />
    <meta property="og:locale" content="${loc.ogLocale}" />
    <meta property="og:title" content="${c.ogTitle}" />
    <meta property="og:description" content="${c.ogDescription}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}${og.path}" />
    <meta property="og:image:width" content="${og.width}" />
    <meta property="og:image:height" content="${og.height}" />
    <meta property="og:image:alt" content="${ogAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${c.ogTitle}" />
    <meta name="twitter:description" content="${c.ogDescription}" />
    <meta name="twitter:image" content="${SITE}${og.path}" />
${
  structured
    ? `    <script type="application/ld+json">\n${ld(structured)}\n    </script>\n`
    : ""
}    <script type="application/ld+json">
${ld(breadcrumb(page.slug, locale, c.navLabel))}
    </script>
    <style>
${FONT_STYLE}
${STYLE}
    </style>
  </head>
  <body>
    <main>
      <header>
        <img src="/favicon.png?v=3" alt="Cascade logo" />
        <a href="/">Cascade</a>
      </header>

      <h1>${c.h1}</h1>
${c.lead}
      <a class="cta" href="/">${c.cta}</a>

${c.body}
${langBar(page.slug, locale)}

      <footer>
        <p>
          ${UI[locale].more}: ${footerLinks(page.slug, locale)}
        </p>
      </footer>
    </main>
  </body>
</html>
`;
}

const HUB_STYLE = `      .group { margin-top: 26px; }
      .guide { display: block; padding: 12px 14px; margin: 8px 0; border: 1px solid #1d1d27; border-radius: 10px; text-decoration: none; background: #101017; }
      .guide:hover { border-color: #3a2a30; background: #15131b; }
      .guide strong { display: block; color: #e6e8ee; font-weight: 600; }
      .guide span { color: #9aa0ad; font-size: 0.92rem; }
      .guide em { font-style: normal; color: #767c8a; font-size: 0.8rem; }`;

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** One entry of a hub: its link, title, summary and whether it's English only. */
function hubEntry(item, locale) {
  if (item.download) {
    return {
      href: urlFor(DOWNLOAD_SLUG, locale),
      title: DOWNLOAD[locale].navLabel,
      description: DOWNLOAD[locale].ogDescription,
      english: false,
    };
  }
  if (item.page) {
    const page = PAGES.find((p) => p.slug === item.page);
    if (!page) throw new Error(`docs hub: no page ${item.page}`);
    return {
      href: docsUrl(page.slug, locale),
      title: page.content[locale].navLabel,
      description: page.content[locale].ogDescription,
      english: false,
    };
  }
  const doc = ENGLISH_DOCS[item.english];
  if (!doc) throw new Error(`docs hub: no English guide ${item.english}`);
  return {
    href: `/docs/${item.english}`,
    title: doc.title,
    description: doc.description,
    english: locale !== "en",
  };
}

function renderHub(locale) {
  const ui = UI[locale];
  const loc = LOCALES[locale];
  const url = `${SITE}${docsHubUrl(locale)}`;
  const og = ogImage({}, locale);
  const groups = DOCS_GROUPS.map((group) => ({
    title: ui.docsGroups[group.id],
    entries: group.items.map((item) => hubEntry(item, locale)),
  }));
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: ui.docsTitle,
    itemListElement: groups
      .flatMap((g) => g.entries)
      .map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${e.href}`, name: e.title })),
  };
  const body = groups
    .map(
      (g) => `      <section class="group">
        <h2>${escapeHtml(g.title)}</h2>
${g.entries
  .map(
    (e) =>
      `        <a class="guide" href="${e.href}"${e.english ? ' hreflang="en"' : ""}><strong>${escapeHtml(e.title)}${
        e.english ? ` <em>(${escapeHtml(ui.englishOnly)})</em>` : ""
      }</strong><span>${escapeHtml(e.description)}</span></a>`,
  )
  .join("\n")}
      </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="${loc.htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/favicon.png?v=3" />
    <link rel="canonical" href="${url}" />
${alternates(docsHubUrl)}
    <meta name="theme-color" content="#0b0d12" />
    <meta name="robots" content="index, follow" />
    <title>${escapeHtml(ui.docsTitle)} | Cascade</title>
    <meta name="description" content="${escapeHtml(ui.docsDescription)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Cascade" />
    <meta property="og:locale" content="${loc.ogLocale}" />
    <meta property="og:title" content="${escapeHtml(ui.docsTitle)}" />
    <meta property="og:description" content="${escapeHtml(ui.docsDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}${og.path}" />
    <meta property="og:image:width" content="${og.width}" />
    <meta property="og:image:height" content="${og.height}" />
    <meta property="og:image:alt" content="${ui.ogImageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(ui.docsTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(ui.docsDescription)}" />
    <meta name="twitter:image" content="${SITE}${og.path}" />
    <script type="application/ld+json">
${ld(list)}
    </script>
    <style>
${FONT_STYLE}
${STYLE}
${HUB_STYLE}
    </style>
  </head>
  <body>
    <main>
      <header>
        <img src="/favicon.png?v=3" alt="Cascade logo" />
        <a href="/">Cascade</a>
      </header>

      <h1>${escapeHtml(ui.docsHeading)}</h1>
      <p>${escapeHtml(ui.docsIntro)}</p>
${body}
      <a class="cta" href="/">${escapeHtml(ui.docsCta)}</a>
${langBar(null, locale)}
    </main>
  </body>
</html>
`;
}

let written = 0;
for (const locale of Object.keys(LOCALES)) {
  const file = hubFileFor(locale);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, renderHub(locale));
  written += 1;
}
for (const page of PAGES) {
  for (const locale of Object.keys(LOCALES)) {
    const file = fileFor(page.slug, locale);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, render(page, locale));
    written += 1;
  }
}
console.log(`landing pages: ${written} files`);
