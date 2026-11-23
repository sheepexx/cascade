// osu! writes the difficulty name into the .osu file name, so a typed name
// keeps to printable ASCII, like the romanised title and artist.
const NOT_PLAIN_ASCII = /[^\x20-\x7e]/g;

export function typedDifficultyName(value: string): string {
  return value.replace(NOT_PLAIN_ASCII, "");
}

/** False for a name imported or saved before typing was limited to ASCII. */
export function isPlainAsciiName(name: string): boolean {
  return typedDifficultyName(name) === name;
}
