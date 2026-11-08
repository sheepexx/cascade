/**
 * The playfield's tools. Note only ever places regular notes, so a click
 * lands on the snap under the cursor even where the note below's art covers
 * it. Hold places a note on a click and draws or stretches long notes on a
 * drag. Select picks and moves notes.
 */
export type PlacementTool = "note" | "hold";
export type EditorTool = PlacementTool | "select";

const PLACEMENT_TOOL_KEY = "mania-editor:placement-tool";

/** The placement tool this device used last: Hold until Note has been picked. */
export function loadPlacementTool(): PlacementTool {
  try {
    return localStorage.getItem(PLACEMENT_TOOL_KEY) === "note" ? "note" : "hold";
  } catch {
    return "hold";
  }
}

export function savePlacementTool(tool: PlacementTool): void {
  try {
    localStorage.setItem(PLACEMENT_TOOL_KEY, tool);
  } catch {
    // Private windows and blocked storage just forget the choice.
  }
}

/** Q: Select, or back to the placement tool used last. */
export function toggleSelectTool(
  tool: EditorTool,
  lastPlacement: PlacementTool,
): EditorTool {
  return tool === "select" ? lastPlacement : "select";
}

/** E: the other placement tool, from Select as well. */
export function togglePlacementTool(
  tool: EditorTool,
  lastPlacement: PlacementTool,
): PlacementTool {
  const current = tool === "select" ? lastPlacement : tool;
  return current === "note" ? "hold" : "note";
}
