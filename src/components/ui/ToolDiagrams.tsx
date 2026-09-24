import { useId, type ReactNode } from "react";

const W = 148;
const H = 72;
const LANE = 11;
const FIELD = LANE * 4;
const TOP = 5;
const BOTTOM = H - 5;
const JUDGE = H - 12;
const LEFT = 10;
const RIGHT = W - 10 - FIELD;

const LINE = "#2b2b38";
const NOTE = "#e9e9f0";
const NOTE_ALT = "#5bc0ff";
const ACCENT = "#e86868";
const MUTED = "#6b7180";
const WELL = "#0d0d14";
const GHOST = "#5eead4";
const GHOST_FOCUS = "#99f6e4";

export type ToolDiagramName = "ghostNotes" | "fullLn" | "fullRc" | "crop" | "mapCard";

type Note = { lane: number; y: number; end?: number };

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-hidden="true"
      className="block w-full rounded-lg bg-[#14141c]"
    >
      {children}
    </svg>
  );
}

function Field({ x, lane = LANE }: { x: number; lane?: number }) {
  return (
    <>
      <rect x={x} y={TOP} width={lane * 4} height={BOTTOM - TOP} fill={WELL} rx={2} />
      {[1, 2, 3].map((i) => (
        <line
          key={i}
          x1={x + lane * i}
          y1={TOP}
          x2={x + lane * i}
          y2={BOTTOM}
          stroke={LINE}
          strokeWidth={1}
        />
      ))}
      <rect x={x} y={JUDGE} width={lane * 4} height={2.5} fill={MUTED} rx={1} />
    </>
  );
}

function Notes({ x, notes, lane = LANE }: { x: number; notes: Note[]; lane?: number }) {
  const w = lane - 3;
  return (
    <>
      {notes.map((n, i) => {
        const nx = x + n.lane * lane + 1.5;
        return (
          <g key={i}>
            {n.end !== undefined && (
              <rect
                x={nx + 1}
                y={n.end}
                width={w - 2}
                height={n.y - n.end + 2}
                rx={1}
                fill={NOTE_ALT}
                opacity={0.55}
              />
            )}
            <rect x={nx} y={n.y} width={w} height={4} rx={1.5} fill={NOTE} />
          </g>
        );
      })}
    </>
  );
}

function Removed({ x, notes }: { x: number; notes: Note[] }) {
  return (
    <>
      {notes.map((n, i) => (
        <rect
          key={i}
          x={x + n.lane * LANE + 1.5}
          y={n.end ?? n.y}
          width={LANE - 3}
          height={n.end === undefined ? 4 : n.y - n.end}
          rx={1.5}
          fill={ACCENT}
          fillOpacity={0.12}
          stroke={ACCENT}
          strokeOpacity={0.75}
          strokeWidth={0.8}
          strokeDasharray="2 1.5"
        />
      ))}
    </>
  );
}

function Arrow() {
  const y = (TOP + BOTTOM) / 2;
  const x1 = LEFT + FIELD + 10;
  const x2 = RIGHT - 10;
  return (
    <g stroke={MUTED} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <polyline points={`${x2 - 4},${y - 4} ${x2},${y} ${x2 - 4},${y + 4}`} />
    </g>
  );
}

function Bracket({ x, y, dir }: { x: number; y: number; dir: 1 | -1 }) {
  const l = x - 3;
  const r = x + FIELD + 3;
  return (
    <polyline
      points={`${l},${y + 4 * dir} ${l},${y} ${r},${y} ${r},${y + 4 * dir}`}
      stroke={ACCENT}
      strokeWidth={1.3}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

const RICE: Note[] = [
  { lane: 0, y: 50 },
  { lane: 0, y: 24 },
  { lane: 1, y: 40 },
  { lane: 1, y: 14 },
  { lane: 2, y: 54 },
  { lane: 2, y: 30 },
  { lane: 3, y: 44 },
  { lane: 3, y: 19 },
];

const LONG: Note[] = RICE.map((n) => {
  const next = RICE.filter((o) => o.lane === n.lane && o.y < n.y).sort(
    (a, b) => b.y - a.y,
  )[0];
  return next ? { ...n, end: next.y + 7 } : n;
});

const CROP_END = 17;
const CROP_START = 49;
const CROP_BEFORE: Note[] = [
  { lane: 0, y: 53 },
  { lane: 0, y: 33 },
  { lane: 1, y: 41, end: 9 },
  { lane: 2, y: 25 },
  { lane: 2, y: 8 },
  { lane: 3, y: 43 },
  { lane: 3, y: 11 },
];
const CROP_AFTER: Note[] = [
  { lane: 0, y: 33 },
  { lane: 1, y: 41, end: CROP_END + 1 },
  { lane: 2, y: 25 },
  { lane: 3, y: 43 },
];
const CROP_CUT: Note[] = [
  { lane: 0, y: 53 },
  { lane: 1, y: CROP_END, end: 9 },
  { lane: 2, y: 8 },
  { lane: 3, y: 11 },
];

const GHOST_LANE = 14;
const GHOST_FIELD = 18;
const WAVE_X = 110;
const PEAKS = [
  { y: 52, s: 15, lane: 0, ghost: false },
  { y: 41, s: 9, lane: 1, ghost: true },
  { y: 30, s: 18, lane: 2, ghost: false },
  { y: 19, s: 11, lane: 3, ghost: true },
  { y: 10, s: 7, lane: 0, ghost: true },
];

function amplitude(y: number): number {
  let a = 1.2;
  for (const p of PEAKS) {
    const d = p.y - y;
    a += p.s * (d >= 0 ? Math.exp(-d / 5) : Math.exp(d / 1.2));
  }
  return Math.min(a, 22);
}

const WAVE = (() => {
  const front: string[] = [];
  const back: string[] = [];
  for (let y = TOP; y <= BOTTOM; y++) {
    const a = amplitude(y);
    front.push(`${(WAVE_X + a).toFixed(1)},${y}`);
    back.push(`${(WAVE_X - a).toFixed(1)},${y}`);
  }
  return `M${front.join(" L")} L${back.reverse().join(" L")} Z`;
})();

function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <polygon
      transform={"translate(" + x + " " + y + ")"}
      points="0,0 0,9 2.4,6.8 4.2,10.5 5.8,9.8 4,6.2 7,6.2"
      fill={NOTE}
      stroke={WELL}
      strokeWidth={0.8}
      strokeLinejoin="round"
    />
  );
}

function GhostNotesDiagram() {
  const w = GHOST_LANE - 3;
  const fieldRight = GHOST_FIELD + GHOST_LANE * 4;
  return (
    <Frame>
      <Field x={GHOST_FIELD} lane={GHOST_LANE} />
      <path d={WAVE} fill={MUTED} opacity={0.6} />
      {PEAKS.filter((p) => p.ghost).map((p) => (
        <line
          key={p.y}
          x1={fieldRight + 2}
          y1={p.y}
          x2={WAVE_X - amplitude(p.y) - 2}
          y2={p.y}
          stroke={GHOST}
          strokeOpacity={0.45}
          strokeWidth={0.8}
          strokeDasharray="1.5 2"
        />
      ))}
      <Notes
        x={GHOST_FIELD}
        lane={GHOST_LANE}
        notes={PEAKS.filter((p) => !p.ghost).map((p) => ({ lane: p.lane, y: p.y - 2 }))}
      />
      {PEAKS.filter((p) => p.ghost).map((p, i) => {
        const focused = i === 0;
        return (
          <rect
            key={p.y}
            x={GHOST_FIELD + p.lane * GHOST_LANE + 1.5}
            y={p.y - 2}
            width={w}
            height={4}
            rx={1.5}
            fill={GHOST}
            fillOpacity={focused ? 0.38 : 0.12}
            stroke={focused ? GHOST_FOCUS : GHOST}
            strokeOpacity={focused ? 1 : 0.6}
            strokeWidth={0.8}
            strokeDasharray="2 1.5"
          />
        );
      })}
      <Cursor
        x={GHOST_FIELD + PEAKS[1].lane * GHOST_LANE + w - 1}
        y={PEAKS[1].y}
      />
    </Frame>
  );
}

const CARD_X = 28;
const CARD_Y = 6;
const CARD_W = 92;
const CARD_H = 60;
const CARD_BANNER = 21;
const CARD_SKILLS = [
  { width: 0.92, color: "#ff9d5c" },
  { width: 0.7, color: NOTE_ALT },
  { width: 0.82, color: ACCENT },
  { width: 0.48, color: GHOST },
];

function MapCardDiagram() {
  const clip = useId();
  const x = CARD_X;
  const y = CARD_Y;
  const hills = [
    [0, CARD_BANNER],
    [14, 12],
    [27, 17],
    [46, 7],
    [66, 16],
    [CARD_W, 9],
    [CARD_W, CARD_BANNER],
  ]
    .map(([dx, dy]) => `${x + dx},${y + dy}`)
    .join(" ");
  return (
    <Frame>
      <defs>
        <clipPath id={clip}>
          <rect x={x} y={y} width={CARD_W} height={CARD_H} rx={5} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={x} y={y} width={CARD_W} height={CARD_H} fill={WELL} />
        <rect x={x} y={y} width={CARD_W} height={CARD_BANNER} fill={NOTE_ALT} opacity={0.18} />
        <polygon points={hills} fill={NOTE_ALT} opacity={0.32} />
        <rect x={x} y={y + CARD_BANNER - 6} width={CARD_W} height={6} fill={WELL} opacity={0.55} />
      </g>
      <rect x={x + 6} y={y + 12} width={40} height={3.6} rx={1.6} fill={NOTE} />
      <rect x={x + 6} y={y + 17.5} width={24} height={2.4} rx={1.2} fill={MUTED} />
      <rect x={x + 6} y={y + 24} width={9} height={4.5} rx={1.6} fill={ACCENT} />
      <rect x={x + 18} y={y + 25} width={22} height={2.6} rx={1.2} fill={MUTED} opacity={0.8} />
      <rect x={x + CARD_W - 20} y={y + 24} width={14} height={4.5} rx={2.2} fill="#f6f05c" opacity={0.9} />
      <rect x={x + 6} y={y + 33} width={18} height={20} rx={2.5} fill={LINE} opacity={0.6} />
      <rect x={x + 9} y={y + 38} width={12} height={5} rx={1.4} fill="#ff9d5c" />
      <rect x={x + 9} y={y + 46} width={8} height={2} rx={1} fill={MUTED} />
      {CARD_SKILLS.map((skill, i) => {
        const bx = x + 30;
        const bw = CARD_W - 36;
        const by = y + 35 + i * 5;
        return (
          <g key={i}>
            <rect x={bx} y={by} width={bw} height={2.2} rx={1.1} fill={LINE} />
            <rect x={bx} y={by} width={bw * skill.width} height={2.2} rx={1.1} fill={skill.color} />
          </g>
        );
      })}
      <rect x={x} y={y} width={CARD_W} height={CARD_H} rx={5} fill="none" stroke={LINE} />
    </Frame>
  );
}

export function ToolDiagram({ name }: { name: ToolDiagramName }) {
  switch (name) {
    case "mapCard":
      return <MapCardDiagram />;
    case "ghostNotes":
      return <GhostNotesDiagram />;
    case "fullLn":
      return (
        <Frame>
          <Field x={LEFT} />
          <Notes x={LEFT} notes={RICE} />
          <Arrow />
          <Field x={RIGHT} />
          <Notes x={RIGHT} notes={LONG} />
        </Frame>
      );
    case "fullRc":
      return (
        <Frame>
          <Field x={LEFT} />
          <Notes x={LEFT} notes={LONG} />
          <Arrow />
          <Field x={RIGHT} />
          <Notes x={RIGHT} notes={RICE} />
        </Frame>
      );
    case "crop":
      return (
        <Frame>
          <Field x={LEFT} />
          <Notes x={LEFT} notes={CROP_BEFORE} />
          <Bracket x={LEFT} y={CROP_END} dir={1} />
          <Bracket x={LEFT} y={CROP_START} dir={-1} />
          <Arrow />
          <Field x={RIGHT} />
          <Removed x={RIGHT} notes={CROP_CUT} />
          <Notes x={RIGHT} notes={CROP_AFTER} />
          <Bracket x={RIGHT} y={CROP_END} dir={1} />
          <Bracket x={RIGHT} y={CROP_START} dir={-1} />
        </Frame>
      );
  }
}
