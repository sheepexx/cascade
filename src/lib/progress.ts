// Progress reporting for the long jobs: exporting a mapset (audio re-encode +
// zip) and importing one (unzip + asset decode). Both can take tens of seconds
// on a big map, so they report a 0-1 ratio plus a human label ("Encoding audio
// - song.mp3") that the UI shows underneath the bar.

export type ProgressReport = {
  /** 0-1, clamped. */
  ratio: number;
  label: string;
};

export type ProgressFn = (report: ProgressReport) => void;

/**
 * Splits a job into weighted phases so each one reports into its own slice of
 * the overall bar. Weights are relative, so callers can say "zipping is worth
 * 3x the parsing" without computing percentages.
 */
export class ProgressSplitter {
  private readonly total: number;
  private offset = 0;
  private index = 0;

  constructor(
    private readonly weights: number[],
    private readonly report?: ProgressFn,
  ) {
    const sum = weights.reduce((a, b) => a + b, 0);
    this.total = sum > 0 ? sum : 1;
  }

  /** Report inside the current phase; `within` is 0-1 of this phase. */
  phase(label: string, within = 0): void {
    if (!this.report) return;
    const weight = this.weights[this.index] ?? 0;
    const ratio = (this.offset + weight * clamp01(within)) / this.total;
    this.report({ ratio: clamp01(ratio), label });
  }

  /** Finish the current phase and move to the next weight. */
  advance(): void {
    this.offset += this.weights[this.index] ?? 0;
    this.index += 1;
  }

  done(label: string): void {
    this.report?.({ ratio: 1, label });
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Remaps a reporter into a sub-range, so chained jobs share one bar. */
export function scopedProgress(
  report: ProgressFn | undefined,
  from: number,
  to: number,
): ProgressFn {
  return ({ ratio, label }) =>
    report?.({ ratio: from + (to - from) * clamp01(ratio), label });
}

/**
 * Reads a response body while reporting bytes, so a slow mirror download shows
 * real movement. Falls back to `.blob()` when the body isn't streamable.
 */
export async function readBlobWithProgress(
  res: Response,
  onBytes: (loaded: number, total: number) => void,
): Promise<Blob> {
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !total) return res.blob();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      onBytes(loaded, total);
    }
  }
  return new Blob(chunks as BlobPart[], {
    type: res.headers.get("content-type") ?? "application/octet-stream",
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
