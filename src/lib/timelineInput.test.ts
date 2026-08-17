import { describe, expect, it } from "vitest";
import {
  TIMELINE_DRAG_SLOP_PX,
  timelineDragStarted,
} from "./timelineInput";

describe("timeline input", () => {
  it("keeps ordinary pointer jitter as a click", () => {
    expect(timelineDragStarted(100, 100.5)).toBe(false);
    expect(timelineDragStarted(100, 100 + TIMELINE_DRAG_SLOP_PX - 0.01)).toBe(
      false,
    );
  });

  it("starts scrubbing at the drag threshold in either direction", () => {
    expect(timelineDragStarted(100, 100 + TIMELINE_DRAG_SLOP_PX)).toBe(true);
    expect(timelineDragStarted(100, 100 - TIMELINE_DRAG_SLOP_PX)).toBe(true);
  });
});
