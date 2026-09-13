export const LANE_WHITE = "#e9e9f0";
export const LANE_BLUE = "#5bc0ff";
export const LANE_GOLD = "#fbbf24";

/**
 * The default playfield's note colour for a lane. Even key counts alternate
 * white and blue from the left; odd ones mirror blue and white in from both
 * edges around a gold centre lane, so 7K reads blue, white, blue, gold, blue,
 * white, blue.
 */
export function defaultLaneColour(column: number, keyCount: number): string {
  if (keyCount % 2 === 1) {
    if (column * 2 === keyCount - 1) return LANE_GOLD;
    return column % 2 === 0 ? LANE_BLUE : LANE_WHITE;
  }
  return column % 2 === 0 ? LANE_WHITE : LANE_BLUE;
}
