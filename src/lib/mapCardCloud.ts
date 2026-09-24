import { supabase } from "./supabase";
import type { MapCardStorageRow } from "./storage";
import { siteUrl } from "./siteAssets";
import { t } from "./i18n/core";
import {
  BUILT_IN_MAP_CARD_PRESETS,
  cleanPresetName,
  normalizeMapCardConfig,
  type MapCardConfig,
  type MapCardPresetOption,
} from "./mapCard";

export type MapCardPreset = {
  id: string;
  name: string;
  config: MapCardConfig;
  updatedAt: string;
};

export type HostedMapCard = {
  slug: string;
  mapKey: string;
  url: string;
  bytes: number;
  width: number;
  height: number;
  version: number;
  updatedAt: string;
};

type PresetRow = {
  id: string;
  name: string;
  config: unknown;
  updated_at: string;
};

const PRESET_COLUMNS = "id,name,config,updated_at";
const CARD_COLUMNS = "slug,map_key,bytes,width,height,version,updated_at";

export function mapCardUrl(slug: string): string {
  return siteUrl(`card/${slug}.png`);
}

export function mapCardPresetOptions(saved: MapCardPreset[]): MapCardPresetOption[] {
  return [
    ...BUILT_IN_MAP_CARD_PRESETS,
    ...saved.map((preset) => ({
      id: preset.id,
      name: preset.name,
      config: preset.config,
      builtIn: false,
    })),
  ];
}

function toPreset(row: PresetRow): MapCardPreset {
  return {
    id: row.id,
    name: row.name,
    config: normalizeMapCardConfig(row.config),
    updatedAt: row.updated_at,
  };
}

export function toHostedMapCard(row: MapCardStorageRow): HostedMapCard {
  return {
    slug: row.slug,
    mapKey: row.map_key,
    url: mapCardUrl(row.slug),
    bytes: Number(row.bytes),
    width: row.width,
    height: row.height,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export async function listMapCardPresets(userId: string): Promise<MapCardPreset[]> {
  const { data, error } = await supabase
    .from("map_card_presets")
    .select(PRESET_COLUMNS)
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as PresetRow[]).map(toPreset);
}

export async function saveMapCardPreset(
  userId: string,
  name: string,
  config: MapCardConfig,
): Promise<MapCardPreset> {
  const clean = cleanPresetName(name);
  if (!clean) throw new Error(t("mapCard.errPresetName"));
  const { data, error } = await supabase
    .from("map_card_presets")
    .upsert(
      { user_id: userId, name: clean, config: normalizeMapCardConfig(config) },
      { onConflict: "user_id,name" },
    )
    .select(PRESET_COLUMNS)
    .single();
  if (error) {
    if (/preset limit/i.test(error.message)) {
      throw new Error(t("mapCard.errPresetLimit"));
    }
    throw new Error(error.message);
  }
  return toPreset(data as PresetRow);
}

export async function deleteMapCardPreset(id: string): Promise<void> {
  const { error } = await supabase.from("map_card_presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function findHostedMapCard(
  userId: string,
  mapKey: string,
): Promise<HostedMapCard | null> {
  const { data, error } = await supabase
    .from("map_cards")
    .select(CARD_COLUMNS)
    .eq("user_id", userId)
    .eq("map_key", mapKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toHostedMapCard(data as MapCardStorageRow) : null;
}
