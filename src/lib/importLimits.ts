import { t } from "./i18n/core";
export const MAX_TEXT_IMPORT_BYTES = 16 * 1024 * 1024;
export const MAX_FOLDER_FILES = 4096;
export const MAX_FOLDER_BYTES = 512 * 1024 * 1024;
export const MAX_FOLDER_DEPTH = 64;

export function assertTextImportSize(file: Pick<File, "name" | "size">): void {
  if (file.size > MAX_TEXT_IMPORT_BYTES) {
    throw new Error(
      t("lib.textMapLimit", { name: file.name, mb: MAX_TEXT_IMPORT_BYTES / 1048576 }),
    );
  }
}

export function assertFolderEntry(
  currentCount: number,
  currentBytes: number,
  nextBytes: number,
  depth: number,
): number {
  if (depth > MAX_FOLDER_DEPTH) throw new Error(t("lib.folderDeep"));
  if (currentCount >= MAX_FOLDER_FILES) throw new Error(t("lib.folderFiles"));
  const bytes = currentBytes + nextBytes;
  if (bytes > MAX_FOLDER_BYTES) throw new Error(t("lib.folderSize"));
  return bytes;
}
