/**
 * The StepMania steps types Cascade writes, by key count. StepMania and
 * Etterna have no type for the other key counts, so those charts are left out
 * of a .sm export instead of being written as a 4-lane chart they would not fit.
 */
export const SM_STEPS_TYPES: Readonly<Record<number, string>> = {
  4: "dance-single",
  5: "pump-single",
  6: "dance-solo",
  7: "kb7-single",
  8: "dance-double",
  10: "pump-double",
};

export function smStepsType(keyCount: number): string | null {
  return SM_STEPS_TYPES[keyCount] ?? null;
}
