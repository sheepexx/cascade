/**
 * Format limits the editor's menus need before any exporter has loaded.
 */

/** Malody's key mode has at most 10 columns. */
export const MALODY_MAX_KEYS = 10;

/** Key counts the Quaver game plays: 4K and 7K. */
export const isQuaverKeyCount = (keyCount: number): boolean =>
  keyCount === 4 || keyCount === 7;
