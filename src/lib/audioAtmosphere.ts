export const MIX_RAMP_SECONDS = 0.38;
export const DUCK_VOLUME_FACTOR = 0.34;
export const DUCK_FILTER_HZ = 1150;
export const NORMAL_FILTER_HZ = 20000;

export function effectiveAudioPower(volume: number, ducked: boolean): number {
  const perceived = Math.max(0, Math.min(1, volume));
  return perceived * perceived * (ducked ? DUCK_VOLUME_FACTOR : 1);
}
