import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// These pages are copied directly from public, so Vite does not bundle their fonts.
// Use the same installed fonts as the editor, including its Cyrillic fallback, so
// every page Cascade publishes is set in the same type as the app.
export async function fontStyles() {
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

/** The editor's `sans` stack, for pages that load the faces above. */
export const PAGE_FONT_FAMILY =
  '"Quicksand", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
