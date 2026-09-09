import type { ReactNode } from "react";

const W = 136;
const H = 74;

const LINE = "#2b2b38";
const NOTE = "#e9e9f0";
const NOTE_ALT = "#5bc0ff";
const ACCENT = "#e86868";
const MUTED = "#6b7180";
const WELL = "#0d0d14";

export type DiagramName =
  | "uiScale"
  | "difficultyPanel"
  | "bottomTimeline"
  | "ppPanel"
  | "backgroundDim"
  | "sizeZoom"
  | "noteHeight"
  | "waveform"
  | "timingLines"
  | "smoothScrolling"
  | "svPreview"
  | "bpmScroll"
  | "scrollDirection"
  | "bodyWidth"
  | "hitPosition"
  | "offsetMs"
  | "hud";

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      role="img"
      aria-hidden="true"
      className="mt-2 block w-full rounded-lg bg-[#14141c]"
    >
      {children}
    </svg>
  );
}

function note(x: number, y: number, w: number, h: number, fill = NOTE) {
  return <rect x={x} y={y} width={w} height={h} rx={1.5} fill={fill} />;
}

function Playfield({
  x = 40,
  width = 56,
  wellOpacity = 1,
  children,
}: {
  x?: number;
  width?: number;
  wellOpacity?: number;
  children?: ReactNode;
}) {
  const step = width / 4;
  return (
    <>
      <rect
        x={x}
        y={4}
        width={width}
        height={H - 8}
        fill={WELL}
        opacity={wellOpacity}
        rx={2}
      />
      {[1, 2, 3].map((i) => (
        <line
          key={i}
          x1={x + step * i}
          y1={4}
          x2={x + step * i}
          y2={H - 4}
          stroke={LINE}
          strokeWidth={1}
        />
      ))}
      {children}
      <rect x={x} y={H - 14} width={width} height={2.5} fill={MUTED} rx={1} />
    </>
  );
}

function Highlight({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx={2} fill={ACCENT} opacity={0.28} />
      <rect x={x} y={y} width={width} height={height} rx={2} fill="none" stroke={ACCENT} />
    </>
  );
}

export function SettingDiagram({
  name,
  value,
}: {
  name: DiagramName;
  value?: number;
}) {
  switch (name) {
    case "uiScale": {
      const s = value == null ? 1 : Math.max(0.75, Math.min(1.5, value));
      return (
        <Frame>
          <rect x={6} y={6} width={W - 12} height={H - 12} fill={WELL} rx={3} />
          <rect x={12} y={12} width={40 * s} height={7 * s} rx={2} fill={MUTED} />
          <rect x={12} y={26 * s} width={70 * s} height={5 * s} rx={2} fill={LINE} />
          <rect x={12} y={36 * s} width={58 * s} height={5 * s} rx={2} fill={LINE} />
          <rect x={12} y={46 * s} width={26 * s} height={9 * s} rx={2} fill={ACCENT} />
        </Frame>
      );
    }
    case "difficultyPanel":
      return (
        <Frame>
          <Highlight x={4} y={4} width={30} height={H - 8} />
          <Playfield x={44} width={52} />
          <rect x={104} y={4} width={28} height={H - 8} rx={2} fill={LINE} />
        </Frame>
      );
    case "bottomTimeline":
      return (
        <Frame>
          <rect x={4} y={4} width={26} height={H - 26} rx={2} fill={LINE} />
          <Playfield x={40} width={56} />
          <rect x={106} y={4} width={26} height={H - 26} rx={2} fill={LINE} />
          <Highlight x={4} y={H - 18} width={W - 8} height={14} />
        </Frame>
      );
    case "ppPanel":
      return (
        <Frame>
          <rect x={4} y={4} width={26} height={H - 8} rx={2} fill={LINE} />
          <Playfield x={40} width={56} />
          <Highlight x={100} y={40} width={32} height={20} />
          <text x={116} y={54} fontSize={9} fill={NOTE} textAnchor="middle">
            pp
          </text>
        </Frame>
      );
    case "backgroundDim": {
      const dim = value == null ? 0.7 : Math.max(0, Math.min(1, value / 100));
      return (
        <Frame>
          <defs>
            <linearGradient id="cascade-dim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7fc4e8" />
              <stop offset="100%" stopColor="#b48cf0" />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={W} height={H} fill="url(#cascade-dim)" />
          <rect x={0} y={0} width={W} height={H} fill="#000" opacity={dim} />
          <Playfield wellOpacity={0} />
          {note(42, 20, 12, 5)}
          {note(70, 38, 12, 5, NOTE_ALT)}
        </Frame>
      );
    }
    case "sizeZoom": {
      const scale = value == null ? 1 : Math.max(0.6, Math.min(1.6, value / 100));
      const width = Math.min(W - 16, 52 * scale);
      const x = W / 2 - width / 2;
      return (
        <Frame>
          <Playfield x={x} width={width} />
          {note(x + 2, 22, width / 4 - 4, 5)}
          {note(x + width / 2 + 2, 40, width / 4 - 4, 5, NOTE_ALT)}
        </Frame>
      );
    }
    case "noteHeight": {
      const h = value == null ? 6 : Math.max(3, Math.min(14, (value / 100) * 6));
      return (
        <Frame>
          <Playfield />
          {note(42, 16, 12, h)}
          {note(56, 32, 12, h, NOTE_ALT)}
          {note(70, 48, 12, h)}
        </Frame>
      );
    }
    case "waveform":
      return (
        <Frame>
          <Playfield>
            {Array.from({ length: 21 }, (_, i) => (
              <rect
                key={i}
                x={42}
                y={7 + i * 3}
                width={Math.abs(Math.sin(i * 1.1)) * 24 + 3}
                height={2}
                fill="#d9b34a"
                opacity={0.5}
              />
            ))}
          </Playfield>
          {note(44, 24, 12, 5)}
          {note(72, 44, 12, 5, NOTE_ALT)}
        </Frame>
      );
    case "timingLines":
      return (
        <Frame>
          <Playfield>
            {[14, 26, 38, 50].map((y, i) => (
              <line
                key={y}
                x1={40}
                y1={y}
                x2={96}
                y2={y}
                stroke={i % 2 ? LINE : ACCENT}
                strokeWidth={i % 2 ? 1 : 1.4}
              />
            ))}
          </Playfield>
          {note(42, 18, 12, 5)}
        </Frame>
      );
    case "smoothScrolling":
      return (
        <Frame>
          <text x={26} y={14} fontSize={7} fill={MUTED} textAnchor="middle">
            off
          </text>
          <text x={104} y={14} fontSize={7} fill={ACCENT} textAnchor="middle">
            on
          </text>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={14} y={24 + i * 12} width={24} height={4} rx={1.5} fill={MUTED} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={92} y={22 + i * 12.5} width={24} height={4} rx={1.5} fill={ACCENT} />
          ))}
          <line x1={68} y1={8} x2={68} y2={H - 6} stroke={LINE} strokeDasharray="2 3" />
        </Frame>
      );
    case "svPreview":
      return (
        <Frame>
          <Playfield>
            {note(42, 12, 52, 3, MUTED)}
            {note(42, 22, 52, 3, MUTED)}
            {note(42, 36, 52, 3, NOTE)}
            {note(42, 44, 52, 3, NOTE)}
            {note(42, 52, 52, 3, NOTE)}
          </Playfield>
          <text x={20} y={22} fontSize={7} fill={MUTED} textAnchor="middle">
            1.0x
          </text>
          <text x={20} y={48} fontSize={7} fill={ACCENT} textAnchor="middle">
            2.0x
          </text>
        </Frame>
      );
    case "bpmScroll":
      return (
        <Frame>
          <Playfield>
            {[10, 18, 26].map((y) => note(42, y, 52, 3, MUTED))}
            <line x1={40} y1={33} x2={96} y2={33} stroke={ACCENT} strokeWidth={1.4} />
            {[38, 43, 48, 53, 58].map((y) => note(42, y, 52, 2.5, NOTE))}
          </Playfield>
          <text x={20} y={22} fontSize={7} fill={MUTED} textAnchor="middle">
            120
          </text>
          <text x={20} y={50} fontSize={7} fill={ACCENT} textAnchor="middle">
            240
          </text>
        </Frame>
      );
    case "scrollDirection":
      return (
        <Frame>
          <Playfield x={12} width={48}>
            {note(14, 12, 44, 4)}
            {note(14, 24, 44, 4, NOTE_ALT)}
          </Playfield>
          <path
            d="M36 38 L36 50 M31 45 L36 50 L41 45"
            stroke={ACCENT}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
          />
          <rect x={76} y={4} width={48} height={H - 8} fill={WELL} rx={2} />
          {[1, 2, 3].map((i) => (
            <line
              key={i}
              x1={76 + 12 * i}
              y1={4}
              x2={76 + 12 * i}
              y2={H - 4}
              stroke={LINE}
              strokeWidth={1}
            />
          ))}
          <rect x={76} y={6} width={48} height={2.5} fill={MUTED} rx={1} />
          {note(78, 58, 44, 4)}
          {note(78, 46, 44, 4, NOTE_ALT)}
          <path
            d="M100 36 L100 24 M95 29 L100 24 L105 29"
            stroke={ACCENT}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
          />
        </Frame>
      );
    case "bodyWidth": {
      const w = value == null ? 10 : Math.max(4, Math.min(14, (value / 100) * 12));
      return (
        <Frame>
          <Playfield>
            <rect
              x={68 - w / 2}
              y={16}
              width={w}
              height={38}
              rx={1}
              fill={NOTE_ALT}
              opacity={0.5}
            />
            {note(62, 12, 12, 5, NOTE_ALT)}
            {note(62, 50, 12, 5, NOTE_ALT)}
          </Playfield>
        </Frame>
      );
    }
    case "hitPosition":
      return (
        <Frame>
          <Playfield>
            {note(42, 18, 12, 5)}
            {note(56, 30, 12, 5, NOTE_ALT)}
            <line
              x1={40}
              y1={H - 24}
              x2={96}
              y2={H - 24}
              stroke={ACCENT}
              strokeWidth={1.6}
              strokeDasharray="3 2"
            />
          </Playfield>
          <path
            d="M106 42 L106 56 M102 52 L106 56 L110 52"
            stroke={ACCENT}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
          />
        </Frame>
      );
    case "offsetMs":
      return (
        <Frame>
          <line x1={10} y1={H / 2} x2={W - 10} y2={H / 2} stroke={LINE} strokeWidth={1} />
          {[24, 52, 80, 108].map((x) => (
            <rect key={x} x={x - 5} y={H / 2 - 13} width={10} height={8} rx={1.5} fill={NOTE} />
          ))}
          {[31, 59, 87, 115].map((x) => (
            <rect key={x} x={x - 5} y={H / 2 + 5} width={10} height={8} rx={1.5} fill={ACCENT} />
          ))}
          <text x={W / 2} y={H - 6} fontSize={7} fill={MUTED} textAnchor="middle">
            audio shifted
          </text>
        </Frame>
      );
    case "hud":
      return (
        <Frame>
          <Playfield />
          <Highlight x={4} y={6} width={30} height={12} />
          <text x={68} y={24} fontSize={12} fill={NOTE} textAnchor="middle" fontWeight="700">
            283
          </text>
          <rect x={102} y={6} width={30} height={22} rx={2} fill={LINE} />
          <rect x={44} y={H - 10} width={48} height={3} rx={1.5} fill={ACCENT} />
        </Frame>
      );
    default:
      return null;
  }
}
