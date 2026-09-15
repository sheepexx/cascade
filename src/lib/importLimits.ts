export const MAX_TEXT_IMPORT_BYTES = 16 * 1024 * 1024;
export const MAX_FOLDER_FILES = 4096;
export const MAX_FOLDER_BYTES = 512 * 1024 * 1024;
export const MAX_FOLDER_DEPTH = 64;

export function assertTextImportSize(file: Pick<File, "name" | "size">): void {
  if (file.size > MAX_TEXT_IMPORT_BYTES) {
    throw new Error(
      `"${file.name}" is larger than the ${MAX_TEXT_IMPORT_BYTES / 1048576} MB text-map limit.`,
    );
  }
}

export function assertFolderEntry(
  currentCount: number,
  currentBytes: number,
  nextBytes: number,
  depth: number,
): number {
  if (depth > MAX_FOLDER_DEPTH) throw new Error("Folder nesting is too deep.");
  if (currentCount >= MAX_FOLDER_FILES) throw new Error("Folder contains too many files.");
  const bytes = currentBytes + nextBytes;
  if (bytes > MAX_FOLDER_BYTES) throw new Error("Folder contents exceed the import size limit.");
  return bytes;
}
