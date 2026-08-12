export function longNoteBodyRange(
  headY: number,
  tailY: number,
  receptorY: number,
): { top: number; height: number } {
  const visibleHeadY = Math.min(headY, receptorY);
  return {
    top: Math.min(visibleHeadY, tailY),
    height: Math.abs(visibleHeadY - tailY),
  };
}
