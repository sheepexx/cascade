import { describe, it, expect, vi } from "vitest";
import {
  ProgressSplitter,
  formatBytes,
  readBlobWithProgress,
  scopedProgress,
  type ProgressReport,
} from "./progress";

describe("ProgressSplitter", () => {
  it("maps each phase into its weighted slice", () => {
    const seen: ProgressReport[] = [];
    // Phase 1 owns 0-25%, phase 2 owns 25-100%.
    const p = new ProgressSplitter([1, 3], (r) => seen.push(r));
    p.phase("a", 0);
    p.phase("a", 1);
    p.advance();
    p.phase("b", 0);
    p.phase("b", 0.5);
    p.done("finished");
    expect(seen.map((r) => r.ratio)).toEqual([0, 0.25, 0.25, 0.625, 1]);
    expect(seen[seen.length - 1].label).toBe("finished");
  });

  it("clamps out-of-range and non-finite input", () => {
    const seen: number[] = [];
    const p = new ProgressSplitter([1], (r) => seen.push(r.ratio));
    p.phase("x", -5);
    p.phase("x", 99);
    p.phase("x", NaN);
    expect(seen).toEqual([0, 1, 0]);
  });

  it("never exceeds 1 even when over-advanced", () => {
    const seen: number[] = [];
    const p = new ProgressSplitter([1, 1], (r) => seen.push(r.ratio));
    p.advance();
    p.advance();
    p.advance();
    p.phase("past the end", 1);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
  });

  it("is a no-op without a reporter", () => {
    const p = new ProgressSplitter([1, 2]);
    expect(() => {
      p.phase("a", 0.5);
      p.advance();
      p.done("d");
    }).not.toThrow();
  });
});

describe("scopedProgress", () => {
  it("remaps a child job into a sub-range", () => {
    const seen: number[] = [];
    const scoped = scopedProgress((r) => seen.push(r.ratio), 0.35, 1);
    scoped({ ratio: 0, label: "start" });
    scoped({ ratio: 0.5, label: "half" });
    scoped({ ratio: 1, label: "end" });
    expect(seen[0]).toBeCloseTo(0.35);
    expect(seen[1]).toBeCloseTo(0.675);
    expect(seen[2]).toBeCloseTo(1);
  });

  it("tolerates a missing parent reporter", () => {
    expect(() =>
      scopedProgress(undefined, 0, 1)({ ratio: 0.5, label: "x" }),
    ).not.toThrow();
  });
});

describe("readBlobWithProgress", () => {
  it("reports bytes while streaming", async () => {
    const chunks = [new Uint8Array(4), new Uint8Array(6)];
    const res = new Response(
      new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      }),
      { headers: { "content-length": "10", "content-type": "application/zip" } },
    );
    const onBytes = vi.fn();
    const blob = await readBlobWithProgress(res, onBytes);
    expect(blob.size).toBe(10);
    expect(onBytes.mock.calls).toEqual([
      [4, 10],
      [10, 10],
    ]);
  });

  it("falls back to blob() when length is unknown", async () => {
    const res = new Response(new Uint8Array(8));
    const onBytes = vi.fn();
    const blob = await readBlobWithProgress(res, onBytes);
    expect(blob.size).toBe(8);
    expect(onBytes).not.toHaveBeenCalled();
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(7 * 1024 * 1024)).toBe("7.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });

  it("returns empty for junk", () => {
    expect(formatBytes(NaN)).toBe("");
    expect(formatBytes(-1)).toBe("");
  });
});
