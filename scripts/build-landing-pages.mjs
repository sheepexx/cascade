import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, PAGES, UI, urlFor } from "./landing-content.mjs";

const SITE = "https://cascade.sheepex.net";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function fileFor(slug, locale) {
  const prefix = LOCALES[locale].prefix;
  return prefix
    ? join(ROOT, "public", prefix, `${slug}.html`)
    : join(ROOT, "public", `${slug}.html`);
}

function alternates(slug) {
  const links = Object.keys(LOCALES).map(
    (code) =>
      `    <link rel="alternate" hreflang="${LOCALES[code].hreflang}" href="${SITE}${urlFor(slug, code)}" />`,
  );
  links.push(
    `    <link rel="alternate" hreflang="x-default" href="${SITE}${urlFor(slug, "en")}" />`,
  );
  return links.join("\n");
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
        name: label,
        item: `${SITE}${urlFor(slug, locale)}`,
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
        font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
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
      .langs { margin: 26px 0 0; font-size: 0.85rem; }
      .langs a { color: #9aa0ad; }
      footer { margin-top: 44px; padding-top: 18px; border-top: 1px solid #1d1d27; font-size: 0.85rem; }
      footer a { color: #9aa0ad; }`;

function langBar(slug, locale) {
  const items = Object.keys(LOCALES)
    .filter((code) => code !== locale)
    .map(
      (code) =>
        `<a href="${urlFor(slug, code)}" hreflang="${LOCALES[code].hreflang}">${LOCALES[code].name}</a>`,
    )
    .join(" · ");
  return `      <p class="langs">${UI[locale].languages}: ${items}</p>`;
}

function footerLinks(slug, locale) {
  const home = `<a href="/">${UI[locale].home}</a>`;
  const others = PAGES.filter((p) => p.slug !== slug).map(
    (p) => `<a href="${urlFor(p.slug, locale)}">${p.content[locale].navLabel}</a>`,
  );
  const legacy = UI[locale].legacy.map(
    (l) => `<a href="${l.href}">${l.label}</a>`,
  );
  return [home, ...others, ...legacy].join(" ·\n          ");
}

function render(page, locale) {
  const c = page.content[locale];
  const loc = LOCALES[locale];
  const url = `${SITE}${urlFor(page.slug, locale)}`;
  const structured = page.structured?.(c, url);

  return `<!doctype html>
<html lang="${loc.htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/favicon.png?v=3" />
    <link rel="canonical" href="${url}" />
${alternates(page.slug)}
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
    <meta property="og:image" content="${SITE}/og.png?v=2" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${UI[locale].ogImageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${c.ogTitle}" />
    <meta name="twitter:description" content="${c.ogDescription}" />
    <meta name="twitter:image" content="${SITE}/og.png?v=2" />
${
  structured
    ? `    <script type="application/ld+json">\n${ld(structured)}\n    </script>\n`
    : ""
}    <script type="application/ld+json">
${ld(breadcrumb(page.slug, locale, c.navLabel))}
    </script>
    <style>
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

let written = 0;
for (const page of PAGES) {
  for (const locale of Object.keys(LOCALES)) {
    const file = fileFor(page.slug, locale);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, render(page, locale));
    written += 1;
  }
}
console.log(`landing pages: ${written} files`);
