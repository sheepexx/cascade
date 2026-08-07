import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://cascade.sheepex.net";

const PAGES = [
  ["public/how-to-make-an-osu-mania-map.html", "/how-to-make-an-osu-mania-map", "How to make an osu!mania map"],
  ["public/osu-to-stepmania.html", "/osu-to-stepmania", "Convert osu!mania to StepMania"],
  ["public/osu-mania-map-viewer.html", "/osu-mania-map-viewer", "osu!mania map viewer"],
  ["public/osu-mania-pack-creator.html", "/osu-mania-pack-creator", "osu!mania pack creator"],
  ["public/osu-mania-sv-editor.html", "/osu-mania-sv-editor", "osu!mania SV editor"],
];

function attr(html, property, name = "property") {
  const re = new RegExp(`<meta ${name}="${property}" content="([^"]*)"`);
  return html.match(re)?.[1] ?? null;
}

function breadcrumb(path, label) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Cascade", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE}${path}` },
    ],
  };
}

for (const [file, path, label] of PAGES) {
  let html = await readFile(file, "utf8");
  const title = attr(html, "og:title");
  const description = attr(html, "og:description");
  if (!title || !description) {
    console.warn(`skipping ${file}: missing og:title/og:description`);
    continue;
  }

  const additions = [];
  if (!attr(html, "og:image:width")) {
    additions.push(
      `    <meta property="og:image:width" content="1200" />`,
      `    <meta property="og:image:height" content="630" />`,
      `    <meta property="og:image:alt" content="The Cascade editor with an osu!mania beatmap open" />`,
    );
  }
  if (!attr(html, "twitter:card", "name")) {
    additions.push(
      `    <meta name="twitter:card" content="summary_large_image" />`,
      `    <meta name="twitter:title" content="${title}" />`,
      `    <meta name="twitter:description" content="${description}" />`,
      `    <meta name="twitter:image" content="${SITE}/og.png" />`,
    );
  }
  if (additions.length) {
    html = html.replace(
      /(<meta property="og:image" content="[^"]*" \/>\n)/,
      `$1${additions.join("\n")}\n`,
    );
  }

  if (!html.includes('"BreadcrumbList"')) {
    const json = JSON.stringify(breadcrumb(path, label), null, 2)
      .split("\n")
      .map((line) => `      ${line}`)
      .join("\n");
    html = html.replace(
      /(\n  <\/head>)/,
      `\n    <script type="application/ld+json">\n${json}\n    </script>$1`,
    );
  }

  await writeFile(file, html);
  console.log(`updated ${file}`);
}
