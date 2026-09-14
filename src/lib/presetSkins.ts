const PRESET_MODULES = import.meta.glob("../../skin/*.osk", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export type PresetSkin = { fileName: string; name: string; url: string };

/** The skins bundled with Cascade, sorted by name. */
export const PRESET_SKINS: PresetSkin[] = Object.entries(PRESET_MODULES)
  .map(([path, url]) => {
    const fileName = path.split("/").pop() ?? path;
    return { fileName, name: fileName.replace(/\.osk$/i, ""), url };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
