import type { DockPanelId } from "../../lib/editorDock";

/** A line icon per panel, on a 20px grid, for the arrange tiles and morphs. */
const PATHS: Record<DockPanelId | "pp", string> = {
  header: "M3 4.5h14v3H3zM5 6h3M10 6h2M14 6h1",
  transport: "M3 10h14M7.5 6.5v7l5-3.5-5-3.5Z",
  difficulties: "M4 4h12v3H4zM4 8.5h12v3H4zM4 13h12v3H4zM6 5.5h.01M6 10h.01M6 14.5h.01",
  info: "M4 16V10M8 16V6M12 16v-4M16 16V4",
  skillsets: "M3 15h2.5v-4H3zM7 15h2.5V7H7zM11 15h2.5v-6H11zM15 15h2V5h-2z",
  timeline: "M2.5 10h1.5l1.2-3 1.6 6 1.6-8 1.6 9 1.6-6 1.2 3h4.7M10 3v14",
  pp: "M3.5 13.5a6.5 6.5 0 1 1 13 0M10 13.5l3-4.5M6 6.5l.8.8M14 6.5l-.8.8M10 4.5v1",
};

export function DockPanelIcon({ id }: { id: DockPanelId | "pp" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[id]} />
    </svg>
  );
}
