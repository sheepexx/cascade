/**
 * Cascade's shared motion language. Keep JS unmount timers in step with the
 * CSS custom properties in index.css.
 */
export const MOTION = {
  quick: 120,
  enter: 280,
  exit: 200,
  scene: 520,
  tooltipDelay: 380,
} as const;

export const MOTION_EASE = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.16, 1, 0.3, 1)",
  overshoot: "cubic-bezier(0.2, 1.35, 0.35, 1)",
} as const;
