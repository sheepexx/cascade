// osu! writes the difficulty name into the .osu file name, so a typed name
// keeps to printable ASCII, like the romanised title and artist.
export function typedDifficultyName(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "");
}
