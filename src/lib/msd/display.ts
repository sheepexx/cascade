import { MSD_SKILLSET_KEYS, type MsdRating } from "./minacalc";

const SKILLSET_LABELS: Record<(typeof MSD_SKILLSET_KEYS)[number], string> = {
  overall: "Overall",
  stream: "Stream",
  jumpstream: "Jumpstream",
  handstream: "Handstream",
  stamina: "Stamina",
  jackspeed: "Jackspeed",
  chordjack: "Chordjack",
  technical: "Technical",
};

const GENERIC_LABELS: Partial<typeof SKILLSET_LABELS> = {
  jumpstream: "Chordstream",
  handstream: "Brackets",
};

export function msdSkillsetLabel(
  key: (typeof MSD_SKILLSET_KEYS)[number],
  keyCount: number,
): string {
  if (keyCount > 4 && GENERIC_LABELS[key]) return GENERIC_LABELS[key];
  return SKILLSET_LABELS[key];
}

export function msdColor(value: number): string {
  const v = Math.max(0, Math.min(40, value));
  const hue = 210 - v * 7;
  return `hsl(${hue} 85% 66%)`;
}

export function msdTooltip(rating: MsdRating, keyCount: number): string {
  const rows = MSD_SKILLSET_KEYS.filter((k) => k !== "overall")
    .map((k) => ({ label: msdSkillsetLabel(k, keyCount), value: rating[k] }))
    .sort((a, b) => b.value - a.value)
    .map((r) => `${r.label}: ${r.value.toFixed(2)}`);
  return [
    `MSD ${rating.overall.toFixed(2)} (Etterna MinaCalc)`,
    ...rows,
  ].join("\n");
}

export function dominantSkillset(
  rating: MsdRating,
  keyCount: number,
): string {
  let bestKey: (typeof MSD_SKILLSET_KEYS)[number] = "stream";
  for (const key of MSD_SKILLSET_KEYS) {
    if (key === "overall") continue;
    if (rating[key] > rating[bestKey]) bestKey = key;
  }
  return msdSkillsetLabel(bestKey, keyCount);
}
