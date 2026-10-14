/** The right offset that lines a popover up with its trigger's right edge and
 *  still keeps all of it on screen, so a trigger near the left of a phone
 *  does not push the popover past the left edge. */
export function popoverRight(trigger: DOMRect, width: number): number {
  return Math.min(
    Math.max(8, window.innerWidth - trigger.right),
    Math.max(8, window.innerWidth - width - 8),
  );
}
