export function formatUiNumber(
  value: number,
  maximumFractionDigits = 2,
): string {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.max(0, Math.min(2, Math.trunc(maximumFractionDigits)));
  const threshold = 0.5 / 10 ** digits;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  const scale = 10 ** digits;
  const adjustment =
    Math.sign(normalized) *
    Number.EPSILON *
    Math.max(1, Math.abs(normalized));
  const rounded = Math.round((normalized + adjustment) * scale) / scale;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
