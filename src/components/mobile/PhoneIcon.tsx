type Name = "move" | "note" | "select" | "erase" | "layers" | "more" | "play" | "pause" | "undo" | "redo" | "tools" | "focus";
const paths: Record<Name, string> = {
  move: "M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8c0 5-2 8-6 8h-2c-2 0-3-1-4-3l-4-5a2 2 0 0 1 3-2l1 1Z",
  note: "m16 3 5 5L9 20H4v-5L16 3Zm-3 3 5 5",
  select: "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8Z",
  erase: "m15 3 7 7-11 11H6l-5-5L15 3Zm-9 9 7 7m-2 2h11",
  layers: "m12 3 10 6-10 6L2 9l10-6Zm-10 12 10 6 10-6M2 12l10 6 10-6",
  more: "M4 11h1v2H4Zm7 0h1v2h-1Zm7 0h1v2h-1Z",
  play: "m7 4 13 8-13 8V4Z",
  pause: "M7 4v16M17 4v16",
  undo: "M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14",
  redo: "m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14",
  tools: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  focus: "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5",
};
export function PhoneIcon({ name }: { name: Name }) {
  return <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
