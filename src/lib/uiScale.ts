export const MIN_UI_SCALE = 0.75;
export const MAX_UI_SCALE = 1.5;
export const UI_SCALE_STEP = 0.05;

export function clampUiScale(value: number): number {
  return Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, value));
}

export function uiScaleFromWheel(current: number, deltaY: number): number {
  if (deltaY === 0) return clampUiScale(current);
  const direction = deltaY < 0 ? 1 : -1;
  return (
    Math.round(clampUiScale(current + direction * UI_SCALE_STEP) * 100) / 100
  );
}
