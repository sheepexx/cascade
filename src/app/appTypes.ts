import type { Difficulty, SongMeta, TimingPoint } from "../types";
import type { ParsedOsu } from "../lib/osuImport";

export type ModalId =
  | "history"
  | "audioSetup"
  | "newMap"
  | "welcome"
  | "myProjects"
  | "import"
  | "sampleMaps"
  | "mapSettings"
  | "settings"
  | "skin"
  | "timing"
  | "sv"
  | "difficulty"
  | "tools"
  | "mapCard"
  | "aimod"
  | "myMaps"
  | "presets"
  | "publishPreset"
  | "feedback"
  | "versionHistory"
  | "admin"
  | "share"
  | "packBrowser"
  | "backups"
  | "account"
  | null;

export type DocSnapshot = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

export type BookmarkLoopState = {
  diffId: string;
  startMs: number;
  endMs: number;
  enabled: boolean;
};

export type OsuEntry = { file: File; parsed: ParsedOsu };
