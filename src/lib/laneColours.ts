export const LANE_WHITE = "#e9e9f0";
export const LANE_BLUE = "#5bc0ff";
export const LANE_GOLD = "#fbbf24";

export type LaneColourScheme = "default" | "colourblind";

type LaneColourSet = { white: string; accent: string; centre: string };

/**
 * The colourblind set keeps white lanes and swaps in orange and sky blue from
 * the Okabe-Ito palette. White against orange differs in brightness, and
 * orange against blue stays apart for red-green and blue-yellow colour
 * blindness alike.
 */
const SCHEMES: Record<LaneColourScheme, LaneColourSet> = {
  default: { white: LANE_WHITE, accent: LANE_BLUE, centre: LANE_GOLD },
  colourblind: { white: "#f2f2f2", accent: "#e69f00", centre: "#56b4e9" },
};

let currentScheme: LaneColourScheme = "default";

/** Set once from the app settings so every playfield drawing follows it. */
export function setLaneColourScheme(scheme: LaneColourScheme): void {
  currentScheme = scheme;
}

export function laneColourSet(scheme: LaneColourScheme = currentScheme): LaneColourSet {
  return SCHEMES[scheme] ?? SCHEMES.default;
}

/**
 * The default playfield's note colour for a lane. Even key counts alternate
 * white and blue from the left; odd ones mirror blue and white in from both
 * edges around a gold centre lane, so 7K reads blue, white, blue, gold, blue,
 * white, blue. The colourblind scheme keeps the layout with its own colours.
 */
export function defaultLaneColour(
  column: number,
  keyCount: number,
  scheme: LaneColourScheme = currentScheme,
): string {
  const { white, accent, centre } = laneColourSet(scheme);
  if (keyCount % 2 === 1) {
    if (column * 2 === keyCount - 1) return centre;
    return column % 2 === 0 ? accent : white;
  }
  return column % 2 === 0 ? white : accent;
}
