/**
 * Joins a primitive's base classes with a caller's, dropping the base ones the
 * caller overrides. Tailwind decides conflicts by stylesheet order, not class
 * order, so without this a caller's `px-2` loses to a base `px-3`. Only the
 * groups the primitives set are recognised; variant-prefixed classes
 * (`hover:`, `uimd:` and so on) are left alone.
 */
const GROUPS: [string, RegExp][] = [
  ["px", /^-?px-/],
  ["py", /^(-?py-|h-|min-h-)/],
  ["p", /^p-/],
  ["text-size", /^text-(2xs|xs|sm|base|lg|xl|2xl|3xl|\[\d)/],
  ["rounded", /^rounded(-(none|sm|md|lg|xl|2xl|3xl|full))?$/],
  ["weight", /^font-(normal|medium|semibold|bold)$/],
  ["width", /^w-/],
];

function groupOf(token: string): string | null {
  if (token.includes(":")) return null;
  const bare = token.replace(/^!/, "");
  for (const [group, pattern] of GROUPS) if (pattern.test(bare)) return group;
  return null;
}

export function mergeClasses(base: string, extra = ""): string {
  if (!extra.trim()) return base;
  const taken = new Set<string>();
  for (const token of extra.split(/\s+/)) {
    const group = groupOf(token);
    if (!group) continue;
    taken.add(group);
    if (group === "p") {
      taken.add("px");
      taken.add("py");
    }
  }
  if (!taken.size) return `${base} ${extra}`;
  const kept = base
    .split(/\s+/)
    .filter((token) => {
      const group = groupOf(token);
      if (!group) return true;
      if (taken.has(group)) return false;
      // A caller setting both axes replaces an all-sides padding.
      return !(group === "p" && (taken.has("px") || taken.has("py")));
    })
    .join(" ");
  return `${kept} ${extra}`;
}
