import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, PAGES, UI, urlFor } from "./landing-content.mjs";
import { CONTENT, SLUG } from "./download-content.mjs";

const SITE = "https://cascade.sheepex.net";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

const LANES = [
  [
    { delay: 0, len: 15 },
    { delay: 2.1, len: 15 },
    { delay: 4.3, len: 15 },
    { delay: 5.4, len: 56 },
  ],
  [
    { delay: 0.7, len: 15 },
    { delay: 2.8, len: 15 },
    { delay: 3.5, len: 15 },
    { delay: 5.6, len: 15 },
  ],
  [
    { delay: 1.4, len: 15 },
    { delay: 3.5, len: 72 },
    { delay: 4.9, len: 15 },
  ],
  [
    { delay: 0.35, len: 15 },
    { delay: 2.45, len: 15 },
    { delay: 4.55, len: 15 },
    { delay: 6.0, len: 15 },
  ],
];

const ICONS = {
  setup: '<path d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M4 15v3a3 3 0 003 3h10a3 3 0 003-3v-3" />',
  msi: '<path d="M4 8.2l8-4 8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4" /><path d="M4 16l8 4 8-4" />',
  portable:
    '<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" /><path d="M3 20h4" /><path d="M17 20h4" />',
};

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
        --panel: rgba(255, 255, 255, 0.04);
        --line: rgba(255, 255, 255, 0.09);
        --text: #e6e8ee;
        --muted: #9aa0ad;
        --dim: #6b7180;
        --accent: #e86868;
        --accent-soft: #f48a8a;
        --blue: #5bc0ff;
        --note: #e9e9f0;
        --dur: 6.5s;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--muted);
        font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
          "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
        line-height: 1.65;
        -webkit-font-smoothing: antialiased;
      }
      .bg { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
      .bg::after {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(120% 50% at 50% -10%, rgba(232, 104, 104, 0.14), transparent 60%);
      }
      .lanes {
        position: absolute;
        top: -120px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 7px;
        width: min(400px, 58vw);
        height: 520px;
        opacity: 0.4;
        -webkit-mask-image: linear-gradient(180deg, transparent, #000 24%, rgba(0, 0, 0, 0.4) 46%, transparent 70%);
        mask-image: linear-gradient(180deg, transparent, #000 24%, rgba(0, 0, 0, 0.4) 46%, transparent 70%);
      }
      .lane {
        position: relative;
        flex: 1;
        border-left: 1px solid rgba(255, 255, 255, 0.05);
        border-right: 1px solid rgba(255, 255, 255, 0.05);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
      }
      .lane:nth-child(2), .lane:nth-child(3) { --note: var(--blue); }
      .lane i {
        position: absolute;
        top: 0;
        left: 20%;
        right: 20%;
        border-radius: 4px;
        background: var(--note);
        box-shadow: 0 0 14px rgba(255, 255, 255, 0.1);
        animation: fall var(--dur) linear infinite;
      }
      @keyframes fall {
        from { transform: translateY(-110px); }
        to { transform: translateY(610px); }
      }
      @media (prefers-reduced-motion: reduce) { .lanes { display: none; } }

      .shell { position: relative; z-index: 1; max-width: 940px; margin: 0 auto; padding: 22px 20px 76px; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 700; font-size: 1.05rem; text-decoration: none; }
      .brand img { width: 32px; height: 32px; border-radius: 9px; }
      .ghost {
        padding: 7px 13px;
        border: 1px solid var(--line);
        border-radius: 9px;
        color: var(--muted);
        font-size: 0.88rem;
        text-decoration: none;
        transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
      }
      .ghost:hover { color: var(--text); border-color: rgba(255, 255, 255, 0.22); background: var(--panel); }

      .hero { padding: 76px 0 48px; text-align: center; }
      .eyebrow { margin: 0 0 14px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent-soft); }
      h1 { margin: 0 0 16px; font-size: clamp(2rem, 6vw, 3.15rem); line-height: 1.08; letter-spacing: -0.02em; font-weight: 700; color: var(--text); }
      .lead { max-width: 620px; margin: 0 auto; font-size: 1.05rem; }
      .hero-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin-top: 24px; font-size: 0.85rem; color: var(--dim); }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 5px 13px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--panel);
        color: var(--text);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); }
      .sep { color: #3a3a48; }

      .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
        transition: transform 0.18s ease, border-color 0.18s ease;
      }
      .card:hover { transform: translateY(-2px); border-color: rgba(255, 255, 255, 0.2); }
      .card.primary { border-color: rgba(232, 104, 104, 0.42); background: linear-gradient(180deg, rgba(232, 104, 104, 0.11), rgba(255, 255, 255, 0.02)); }
      .card.primary:hover { border-color: rgba(232, 104, 104, 0.68); }
      .icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        margin-bottom: 14px;
        border: 1px solid var(--line);
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--accent-soft);
      }
      .icon svg { width: 19px; height: 19px; }
      .card h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text); }
      .kind { margin: 2px 0 0; font-size: 0.78rem; color: var(--dim); }
      .card .text { margin: 13px 0 0; font-size: 0.9rem; }
      .grow { flex: 1; min-height: 14px; }
      .badge {
        position: absolute;
        top: 17px;
        right: 17px;
        padding: 3px 9px;
        border: 1px solid rgba(232, 104, 104, 0.38);
        border-radius: 999px;
        background: rgba(232, 104, 104, 0.2);
        color: #ffd9d9;
        font-size: 0.64rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 11px 16px;
        border: 1px solid var(--line);
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.07);
        color: var(--text);
        font-size: 0.92rem;
        font-weight: 600;
        text-decoration: none;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .btn:hover { background: rgba(255, 255, 255, 0.13); border-color: rgba(255, 255, 255, 0.24); }
      .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      .btn.primary:hover { background: var(--accent-soft); border-color: var(--accent-soft); }
      .size { margin: 9px 0 0; text-align: center; font-size: 0.76rem; color: var(--dim); font-variant-numeric: tabular-nums; }
      .notice {
        margin: 18px 0 0;
        padding: 11px 15px;
        border: 1px solid rgba(251, 191, 36, 0.25);
        border-radius: 11px;
        background: rgba(251, 191, 36, 0.07);
        color: #e8d9a8;
        font-size: 0.85rem;
      }

      .block { margin-top: 64px; }
      .block h2 { margin: 0 0 20px; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }
      .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 28px; }
      .item { padding-left: 14px; border-left: 2px solid rgba(232, 104, 104, 0.35); }
      .notes .item { border-left-color: rgba(255, 255, 255, 0.13); }
      .item h3 { margin: 0 0 3px; font-size: 0.95rem; font-weight: 600; color: var(--text); }
      .item p { margin: 0; font-size: 0.9rem; }

      .web { margin-top: 64px; padding: 30px 26px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel); text-align: center; }
      .web h2 { margin: 0 0 8px; font-size: 1.15rem; font-weight: 700; color: var(--text); }
      .web p { max-width: 520px; margin: 0 auto 20px; font-size: 0.95rem; }
      .web .btn { display: inline-flex; }

      .langs { margin: 34px 0 0; font-size: 0.85rem; }
      .langs a { color: var(--muted); }
      a { color: var(--accent-soft); }
      footer { margin-top: 26px; padding-top: 18px; border-top: 1px solid #1d1d27; font-size: 0.85rem; }
      footer a { color: var(--muted); }

      @media (max-width: 820px) {
        .cards { grid-template-columns: 1fr; }
        .hero { padding: 52px 0 40px; }
      }
      @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }`;

function lanes() {
  const columns = LANES.map((notes) => {
    const items = notes
      .map(
        (note) =>
          `<i style="height: ${note.len}px; animation-delay: -${note.delay}s"></i>`,
      )
      .join("");
    return `        <span class="lane">${items}</span>`;
  }).join("\n");
  return `    <div class="bg" aria-hidden="true">\n      <div class="lanes">\n${columns}\n      </div>\n    </div>`;
}

function card(id, c, primary) {
  const item = c.cards[id];
  return `        <article class="card${primary ? " primary" : ""}">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>
          </span>
${primary ? `          <span class="badge">${esc(c.recommended)}</span>\n` : ""}          <h2>${esc(item.name)}</h2>
          <p class="kind">${esc(item.kind)}</p>
          <p class="text">${esc(item.text)}</p>
          <span class="grow"></span>
          <a class="btn${primary ? " primary" : ""}" href="#" data-asset="${id}">${esc(item.cta)}</a>
          <p class="size" data-size="${id}" hidden></p>
        </article>`;
}

function items(list, className) {
  const body = list
    .map(
      (entry) => `          <div class="item">
            <h3>${esc(entry.name)}</h3>
            <p>${esc(entry.text)}</p>
          </div>`,
    )
    .join("\n");
  return `        <div class="grid2${className ? ` ${className}` : ""}">\n${body}\n        </div>`;
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

function footerLinks(locale) {
  const home = `<a href="${locale === "en" ? "/" : `/${LOCALES[locale].prefix}`}">${UI[locale].home}</a>`;
  const landing = PAGES.map(
    (page) =>
      `<a href="${urlFor(page.slug, locale)}">${page.content[locale].navLabel}</a>`,
  );
  const legacy = UI[locale].legacy.map(
    (link) => `<a href="${link.href}">${link.label}</a>`,
  );
  return [home, ...landing, ...legacy].join(" ·\n          ");
}

function render(locale) {
  const c = CONTENT[locale];
  const loc = LOCALES[locale];
  const url = `${SITE}${urlFor(SLUG, locale)}`;

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
${STYLE}
    </style>
  </head>
  <body>
${lanes()}
    <div class="shell"
      data-notice-error="${attr(c.noticeError)}"
      data-notice-empty="${attr(c.noticeEmpty)}"
      data-notice-other="${attr(c.noticeOther)}"
      data-released="${attr(c.releasedLabel)}"
    >
      <header class="top">
        <a class="brand" href="/">
          <img src="/favicon.png?v=3" alt="" />
          <span>Cascade</span>
        </a>
        <a class="ghost" href="/">${esc(c.browserLink)}</a>
      </header>

      <section class="hero">
        <p class="eyebrow">${esc(c.eyebrow)}</p>
        <h1>${esc(c.h1)}</h1>
        <p class="lead">${esc(c.lead)}</p>
        <p class="hero-meta">
          <span class="pill" data-version>${esc(c.versionPending)}</span>
          <span class="sep">·</span>
          <span>${esc(c.specs)}</span>
          <span class="sep" data-date-sep hidden>·</span>
          <span data-date hidden></span>
        </p>
      </section>

      <section class="cards">
${card("setup", c, true)}
${card("msi", c, false)}
${card("portable", c, false)}
      </section>
      <p class="notice" data-notice hidden></p>

      <section class="block">
        <h2>${esc(c.featuresTitle)}</h2>
${items(c.features)}
      </section>

      <section class="block">
        <h2>${esc(c.notesTitle)}</h2>
${items(c.notes, "notes")}
      </section>

      <section class="web">
        <h2>${esc(c.webTitle)}</h2>
        <p>${esc(c.webLead)}</p>
        <a class="btn primary" href="/">${esc(c.webCta)}</a>
      </section>

${langBar(locale)}

      <footer>
        <p>
          ${UI[locale].more}: ${footerLinks(locale)}
        </p>
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
