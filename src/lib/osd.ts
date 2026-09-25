import { t } from "./i18n/core";

export type OsdIndicator =
  | { kind: "toggle"; on: boolean }
  | { kind: "range"; fraction: number };

/** What the on-screen display shows after a shortcut changes a setting. */
export type OsdNotice = {
  /** What changed, such as "Playfield size". */
  label: string;
  /** Its new state, shown large. Without one, the label is the message. */
  value?: string;
  indicator?: OsdIndicator;
  /** The keys that do this, shown underneath. */
  keys?: string[];
};

export function osdToggle(label: string, on: boolean, keys?: string[]): OsdNotice {
  return {
    label,
    value: on ? t("common.enabled") : t("common.disabled"),
    indicator: { kind: "toggle", on },
    keys,
  };
}

/** A setting on a scale, with a meter showing where `current` sits in it. */
export function osdRange(
  label: string,
  value: string,
  current: number,
  min: number,
  max: number,
  keys?: string[],
): OsdNotice {
  const fraction = max > min ? (current - min) / (max - min) : 1;
  return {
    label,
    value,
    indicator: { kind: "range", fraction: Math.min(1, Math.max(0, fraction)) },
    keys,
  };
}
