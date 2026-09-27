/**
 * Which of a song's two names to show.
 *
 * osu! metadata carries a romanised title and artist and, for anything not
 * written in the Latin alphabet, the original script alongside. Cascade shows
 * the romanised pair by default because it is the one everyone can read and
 * search for; "prefer metadata in original language" swaps that round wherever
 * a name is displayed. Nothing here touches what is stored or exported — the
 * map keeps both fields either way.
 */
export type DisplayNames = {
  title: string;
  artist: string;
  titleUnicode?: string;
  artistUnicode?: string;
};

const pick = (original: string | undefined, romanised: string): string => {
  const trimmed = original?.trim();
  return trimmed ? trimmed : romanised;
};

export function displayTitle(meta: DisplayNames, preferOriginal: boolean): string {
  return preferOriginal ? pick(meta.titleUnicode, meta.title) : meta.title;
}

export function displayArtist(meta: DisplayNames, preferOriginal: boolean): string {
  return preferOriginal ? pick(meta.artistUnicode, meta.artist) : meta.artist;
}

/** "Artist - Title", the form the header and Discord both want. */
export function displaySong(
  meta: DisplayNames,
  preferOriginal: boolean,
  separator = " - ",
): string {
  const artist = displayArtist(meta, preferOriginal).trim();
  const title = displayTitle(meta, preferOriginal).trim();
  if (!artist) return title;
  if (!title) return artist;
  return `${artist}${separator}${title}`;
}
