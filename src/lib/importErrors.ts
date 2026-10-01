import type { Translate } from "./i18n";

export type ImportProblem = { message: string; details?: string };

/** Shows an import failure; `details` sits behind the toast's Details toggle. */
export type SetImportError = (message: string | null, details?: string) => void;

/** How browsers word a file read that failed, when the error has no useful name. */
const UNREADABLE = /I\/O read operation failed|could not be read|NotReadableError/i;

/** What the zip reader throws for a file that isn't a whole archive. */
const ARCHIVE_ERROR =
  /end of central directory|is this a zip file|corrupted zip|invalid (zip|signature)|unsupported compression|zip64/i;

/**
 * Turns an error from opening a file into something to show. Messages Cascade
 * wrote for people pass through; a damaged archive gets a plain explanation;
 * anything that reads like a bug falls back to `fallback`. Whatever was hidden
 * is kept as details for a bug report.
 */
export function describeImportFailure(
  error: unknown,
  fallback: string,
  t: Translate,
): ImportProblem {
  if (!(error instanceof Error) || !error.message) return { message: fallback };
  const raw = `${error.name}: ${error.message}`;
  // The browser could not read the bytes: a file moved or still in the cloud,
  // or (on WebKit) a stored copy that went away.
  if (error.name === "NotReadableError" || UNREADABLE.test(error.message)) {
    return { message: t("import.notReadable"), details: raw };
  }
  if (ARCHIVE_ERROR.test(error.message)) {
    return { message: t("import.notAnArchive"), details: raw };
  }
  if (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof SyntaxError ||
    error instanceof ReferenceError
  ) {
    return { message: fallback, details: raw };
  }
  return { message: error.message };
}
