import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, PAGES, UI, urlFor } from "./landing-content.mjs";

const SITE = "https://cascade.sheepex.net";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const HEAD = {
  de: {
    title: "Cascade | osu!mania-Editor und Map-Viewer im Browser",
    description:
      "Cascade ist ein osu!mania-Editor im Browser für osu!mania-, StepMania- und Etterna-Beatmaps. Mania-Maps ansehen, Scroll-Geschwindigkeit im SV-Editor bearbeiten, Beatmaps per Link direkt aus osu! importieren, osu nach Etterna oder StepMania konvertieren, Timing und Noten bearbeiten, in Echtzeit zusammenarbeiten und als .osu, .osz oder .sm exportieren.",
    ogTitle: "osu!mania-Editor im Browser",
    ogDescription:
      "osu!mania-, StepMania- und Etterna-Beatmaps im Browser erstellen, ansehen, importieren, konvertieren und exportieren, mit Zusammenarbeit in Echtzeit.",
    noscript: "Cascade braucht aktiviertes JavaScript, um den Editor zu starten.",
    languages: "Diese Seite auf",
    more: "Mehr",
  },
  ru: {
    title: "Cascade | Онлайн-редактор osu!mania и просмотр карт",
    description:
      "Cascade - это онлайн-редактор mania для битмапов osu!mania, StepMania и Etterna. Смотри mania-карты, редактируй скорость скролла в SV-редакторе, импортируй битмапы прямо из osu! по ссылке, конвертируй osu в Etterna или StepMania, правь тайминг и ноты, работай вместе в реальном времени и экспортируй .osu, .osz или .sm.",
    ogTitle: "Онлайн-редактор osu!mania",
    ogDescription:
      "Создавай, смотри, импортируй, конвертируй и экспортируй карты osu!mania, StepMania и Etterna в браузерном mania-редакторе с совместной работой в реальном времени.",
    noscript: "Для работы редактора Cascade нужен включённый JavaScript.",
    languages: "Эта страница на",
    more: "Ещё",
  },
  "zh-CN": {
    title: "Cascade | 在线 osu!mania 编辑器与谱面预览",
    description:
      "Cascade 是一个在线 mania 编辑器，支持 osu!mania、StepMania 和 Etterna 谱面。预览 mania 谱面，用 SV 编辑器调整滚动速度，通过链接直接从 osu! 导入谱面，把 osu 转换成 Etterna 或 StepMania，编辑时间轴和音符，实时协作，并导出 .osu、.osz 或 .sm。",
    ogTitle: "在线 osu!mania 编辑器",
    ogDescription:
      "在浏览器里的 mania 编辑器中创建、预览、导入、转换和导出 osu!mania、StepMania 与 Etterna 谱面，并支持实时协作。",
    noscript: "Cascade 需要启用 JavaScript 才能运行编辑器。",
    languages: "其他语言",
    more: "更多",
  },
  "pt-BR": {
    title: "Cascade | Editor de osu!mania e visualizador de mapas online",
    description:
      "O Cascade é um editor de mania online para beatmaps de osu!mania, StepMania e Etterna. Visualize mapas de mania, ajuste a velocidade de rolagem no editor de SV, importe beatmaps direto do osu! por link, converta osu para Etterna ou StepMania, edite timing e notas, colabore em tempo real e exporte .osu, .osz ou .sm.",
    ogTitle: "Editor de osu!mania online",
    ogDescription:
      "Crie, visualize, importe, converta e exporte mapas de osu!mania, StepMania e Etterna em um editor de mania no navegador, com colaboração em tempo real.",
    noscript: "O Cascade precisa de JavaScript ativado para rodar o editor.",
    languages: "Leia em",
    more: "Mais",
  },
};

const DO_KEYS = Array.from({ length: 10 }, (_, i) => `landing.do${i + 1}`);
const FAQ_KEYS = Array.from({ length: 6 }, (_, i) => [
  `landing.faqQ${i + 1}`,
  `landing.faqA${i + 1}`,
]);

async function loadCatalog(file, name) {
  const source = await readFile(join(ROOT, "src/lib/i18n/locales", file), "utf8");
  const js = source
    .split("\n")
    .filter((line) => !line.startsWith("import type "))
    .join("\n")
    .replace(`export const ${name}: PartialCatalog =`, `export const ${name} =`)
    .replace(`export const ${name} =`, "export default")
    .replace(/}\s*as const;\s*$/, "};\n");
  if (!js.includes("export default")) {
    throw new Error(`build-home-pages: no catalog export in ${file}`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  return (await import(url)).default;
}

const CATALOGS = {
  en: await loadCatalog("en.ts", "en"),
  de: await loadCatalog("de.ts", "de"),
  ru: await loadCatalog("ru.ts", "ru"),
  "zh-CN": await loadCatalog("zh-CN.ts", "zhCN"),
  "pt-BR": await loadCatalog("pt-BR.ts", "ptBR"),
};

function message(locale, key) {
  const value = CATALOGS[locale][key] ?? CATALOGS.en[key];
  if (!value) throw new Error(`missing message ${key}`);
  return value;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rich(value) {
  return escapeHtml(value)
    .split("`")
    .map((part, i) => (i % 2 === 1 ? `<code>${part}</code>` : part))
    .join("");
}

function homeUrl(locale) {
  const prefix = LOCALES[locale].prefix;
  return prefix ? `/${prefix}` : "/";
}

function bootSection(locale) {
  const ui = HEAD[locale];
  const items = DO_KEYS.map(
    (key) => `          <li>${rich(message(locale, key))}</li>`,
  ).join("\n");
  const faq = FAQ_KEYS.map(
    ([question, answer]) =>
      `          <dt>${escapeHtml(message(locale, question))}</dt>\n` +
      `          <dd>${rich(message(locale, answer))}</dd>`,
  ).join("\n");
  const guides = PAGES.map(
    (page) =>
      `          <a href="${urlFor(page.slug, locale)}">${escapeHtml(page.content[locale].navLabel)}</a>`,
  ).join(" ·\n");
  const languages = Object.keys(LOCALES)
    .filter((code) => code !== locale)
    .map(
      (code) =>
        `          <a href="${homeUrl(code)}" hreflang="${LOCALES[code].hreflang}">${LOCALES[code].name}</a>`,
    )
    .join(" ·\n");

  return `      <section class="boot-seo">
        <h1>${escapeHtml(message(locale, "landing.h1"))}</h1>
        <p>${rich(message(locale, "landing.intro"))}</p>

        <h2>${escapeHtml(message(locale, "landing.doTitle"))}</h2>
        <ul>
${items}
        </ul>

        <h2>${escapeHtml(message(locale, "landing.faqTitle"))}</h2>
        <dl>
${faq}
        </dl>

        <noscript>
          <p class="boot-noscript">${escapeHtml(ui.noscript)}</p>
        </noscript>

        <p class="boot-links">
          ${escapeHtml(ui.more)}:
${guides}
        </p>

        <p class="boot-links">
          ${escapeHtml(ui.languages)}:
${languages}
        </p>
      </section>`;
}

function ld(value) {
  const body = JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
  return `<script type="application/ld+json">\n${body}\n    </script>`;
}

function dropBlock(html, block) {
  const start = html.indexOf(block);
  if (start < 0) return html;
  const lineStart = html.lastIndexOf("\n", start) + 1;
  let end = start + block.length;
  if (html.slice(end, end + 2) === "\n\n") end += 2;
  else if (html[end] === "\n") end += 1;
  return html.slice(0, lineStart) + html.slice(end);
}

function localiseStructuredData(html, locale, url) {
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [...html.matchAll(pattern)];
  if (!blocks.length) {
    throw new Error("build-home-pages: no structured data in index.html");
  }
  for (const block of blocks) {
    const data = JSON.parse(block[1]);
    if (data["@type"] === "WebApplication") {
      html = html.replace(
        block[0],
        ld({
          ...data,
          url,
          description: HEAD[locale].description,
          inLanguage: LOCALES[locale].hreflang,
        }),
      );
    } else if (data["@type"] === "FAQPage") {
      html = html.replace(
        block[0],
        ld({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          inLanguage: LOCALES[locale].hreflang,
          mainEntity: FAQ_KEYS.map(([question, answer]) => ({
            "@type": "Question",
            name: message(locale, question),
            acceptedAnswer: {
              "@type": "Answer",
              text: message(locale, answer).replace(/`/g, ""),
            },
          })),
        }),
      );
    } else if (data["@type"] === "HowTo") {
      html = dropBlock(html, block[0]);
    }
  }
  return html;
}

function swap(html, from, to, label) {
  if (!html.includes(from)) {
    throw new Error(`build-home-pages: could not find ${label} in index.html`);
  }
  return html.replace(from, to);
}

function swapPattern(html, pattern, to, label) {
  if (!pattern.test(html)) {
    throw new Error(`build-home-pages: could not find ${label} in index.html`);
  }
  return html.replace(pattern, to);
}

const source = await readFile(join(ROOT, "dist", "index.html"), "utf8");

const bootStart = source.indexOf('      <section class="boot-seo">');
const bootEnd = source.indexOf("</section>", bootStart);
if (bootStart < 0 || bootEnd < 0) {
  throw new Error("build-home-pages: could not find the boot copy in index.html");
}
const englishBoot = source.slice(bootStart, bootEnd + "</section>".length);

for (const locale of Object.keys(LOCALES)) {
  const href = `href="${SITE}${homeUrl(locale)}"`;
  if (!source.includes(`<link rel="alternate" hreflang="${LOCALES[locale].hreflang}" ${href} />`)) {
    throw new Error(`build-home-pages: index.html is missing the ${locale} hreflang link`);
  }
}

let written = 0;
for (const locale of Object.keys(LOCALES)) {
  const prefix = LOCALES[locale].prefix;
  if (!prefix) continue;
  const ui = HEAD[locale];
  const url = `${SITE}${homeUrl(locale)}`;

  let html = source;
  html = swap(html, '<html lang="en">', `<html lang="${LOCALES[locale].htmlLang}">`, "html lang");
  html = swap(
    html,
    `<link rel="canonical" href="${SITE}/" />`,
    `<link rel="canonical" href="${url}" />`,
    "canonical",
  );
  html = swap(
    html,
    "<title>Cascade | Online osu!mania Editor and Map Viewer</title>",
    `<title>${escapeHtml(ui.title)}</title>`,
    "title",
  );
  html = swapPattern(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
    `<meta name="description" content="${escapeHtml(ui.description)}" />`,
    "description",
  );
  html = swap(
    html,
    '<meta property="og:site_name" content="Cascade" />',
    `<meta property="og:site_name" content="Cascade" />\n    <meta property="og:locale" content="${LOCALES[locale].ogLocale}" />`,
    "og:site_name",
  );
  html = swap(
    html,
    '<meta property="og:title" content="Cascade | Online osu!mania Editor and Map Viewer" />',
    `<meta property="og:title" content="${escapeHtml(ui.ogTitle)}" />`,
    "og:title",
  );
  html = swap(
    html,
    '<meta name="twitter:title" content="Cascade | Online osu!mania Editor and Map Viewer" />',
    `<meta name="twitter:title" content="${escapeHtml(ui.ogTitle)}" />`,
    "twitter:title",
  );
  html = swap(
    html,
    `<meta property="og:url" content="${SITE}/" />`,
    `<meta property="og:url" content="${url}" />`,
    "og:url",
  );
  html = swapPattern(
    html,
    /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/>/s,
    `<meta property="og:image:alt" content="${escapeHtml(UI[locale].ogImageAlt)}" />`,
    "og:image:alt",
  );
  html = swapPattern(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/s,
    `<meta property="og:description" content="${escapeHtml(ui.ogDescription)}" />`,
    "og:description",
  );
  html = swapPattern(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/s,
    `<meta name="twitter:description" content="${escapeHtml(ui.ogDescription)}" />`,
    "twitter:description",
  );
  html = swap(html, englishBoot, bootSection(locale), "boot copy");
  html = localiseStructuredData(html, locale, url);

  const dir = join(ROOT, "dist", prefix);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html);
  written += 1;
}

console.log(`home pages: ${written} locales`);
