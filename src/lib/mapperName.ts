import { DEFAULT_SONG_META } from "../types";

export function cleanMapperName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function hasMapperName(creator: string | null | undefined): boolean {
  const name = cleanMapperName(creator);
  return name.length > 0 && name !== DEFAULT_SONG_META.creator;
}

export type MapperNameChoice =
  | { kind: "keep" }
  | { kind: "account"; name: string }
  | { kind: "ask" };

export function chooseMapperName(
  creator: string | null | undefined,
  username: string | null | undefined,
): MapperNameChoice {
  if (hasMapperName(creator)) return { kind: "keep" };
  const name = cleanMapperName(username);
  return name ? { kind: "account", name } : { kind: "ask" };
}
