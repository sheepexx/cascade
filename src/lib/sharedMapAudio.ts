export function resolveSharedAudioUrl(
  audioUrls: Record<string, string>,
  legacyAudioUrl: string | null,
  audioFilename?: string,
): string | null {
  if (audioFilename) {
    if (audioUrls[audioFilename]) {
      return audioUrls[audioFilename];
    }
    if (Object.keys(audioUrls).length) {
      return null;
    }
  }
  const urls = Object.values(audioUrls);
  if (!audioFilename && urls.length === 1) return urls[0];
  return legacyAudioUrl;
}
