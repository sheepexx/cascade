// Parses the beatmap links people actually paste: full beatmapset URLs with
// or without a difficulty anchor, old-site /b/ links, /beatmaps/ links, and
// bare numeric IDs (assumed to be a set ID).

export type ParsedOsuLink = {
  setId?: number;
  beatmapId?: number;
};

export function parseOsuBeatmapLink(input: string): ParsedOsuLink | null {
  const text = input.trim();
  if (!text) return null;

  if (/^\d{1,10}$/.test(text)) {
    return { setId: Number(text) };
  }

  const set = text.match(/beatmapsets\/(\d{1,10})/i);
  if (set) {
    const out: ParsedOsuLink = { setId: Number(set[1]) };
    // Difficulty anchor: .../beatmapsets/123#mania/456 (any mode name).
    const anchor = text.match(/#[a-z]+\/(\d{1,10})/i);
    if (anchor) out.beatmapId = Number(anchor[1]);
    return out;
  }

  const beatmap = text.match(/(?:\/b|beatmaps)\/(\d{1,10})/i);
  if (beatmap) {
    return { beatmapId: Number(beatmap[1]) };
  }

  return null;
}
