import type { ReactNode } from "react";
import { useT } from "../../lib/i18n";

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

function Lane({ x, width = 40 }: { x: number; width?: number }) {
  return (
    <rect x={x} y={16} width={width} height={H - 20} fill={WELL} rx={2} />
  );
}

const HEAD = 18;

function ArrowH({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const heads = x2 - x1 >= HEAD;
  return (
    <g stroke={ACCENT} strokeWidth={1.3} fill="none" strokeLinecap="round">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      {heads && (
        <>
          <polyline points={`${x1 + 5},${y - 3} ${x1 + 1},${y} ${x1 + 5},${y + 3}`} />
          <polyline points={`${x2 - 5},${y - 3} ${x2 - 1},${y} ${x2 - 5},${y + 3}`} />
        </>
      )}
    </g>
  );
}

function ArrowV({ y1, y2, x }: { y1: number; y2: number; x: number }) {
  const heads = y2 - y1 >= HEAD;
  return (
    <g stroke={ACCENT} strokeWidth={1.3} fill="none" strokeLinecap="round">
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
      {heads && (
        <>
          <polyline points={`${x - 3},${y1 + 5} ${x},${y1 + 1} ${x + 3},${y1 + 5}`} />
          <polyline points={`${x - 3},${y2 - 5} ${x},${y2 - 1} ${x + 3},${y2 - 5}`} />
        </>
      )}
    </g>
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
  const t = useT();
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
          {note(x + 2, 26, width / 4 - 4, 5)}
          {note(x + width / 2 + 2, 42, width / 4 - 4, 5, NOTE_ALT)}
          <ArrowH x1={x} x2={x + width} y={14} />
        </Frame>
      );
    }
    case "noteHeight": {
      const h = value == null ? 9 : Math.max(4, Math.min(20, (value / 100) * 9));
      return (
        <Frame>
          <Playfield />
          {note(44, 10, 12, h)}
          {note(58, 36, 12, h, NOTE_ALT)}
          <ArrowV x={38} y1={10} y2={10 + h} />
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
          <text x={34} y={13} fontSize={7} fill={MUTED} textAnchor="middle">
            {t("diagram.off")}
          </text>
          <text x={102} y={13} fontSize={7} fill={ACCENT} textAnchor="middle">
            {t("diagram.on")}
          </text>
          <line x1={12} y1={62} x2={58} y2={62} stroke={LINE} strokeWidth={1} />
          <line x1={12} y1={62} x2={12} y2={20} stroke={LINE} strokeWidth={1} />
          <polyline
            points="12,58 23,58 23,45 34,45 34,32 45,32 45,20 56,20"
            fill="none"
            stroke={MUTED}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <line x1={80} y1={62} x2={126} y2={62} stroke={LINE} strokeWidth={1} />
          <line x1={80} y1={62} x2={80} y2={20} stroke={LINE} strokeWidth={1} />
          <line
            x1={80}
            y1={58}
            x2={124}
            y2={20}
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text x={34} y={71} fontSize={6} fill={MUTED} textAnchor="middle">
            {t("diagram.jumps")}
          </text>
          <text x={102} y={71} fontSize={6} fill={MUTED} textAnchor="middle">
            {t("diagram.glides")}
          </text>
        </Frame>
      );
    case "svPreview":
      return (
        <Frame>
          <text x={34} y={13} fontSize={7} fill={MUTED} textAnchor="middle">
            {t("diagram.off")}
          </text>
          <text x={102} y={13} fontSize={7} fill={ACCENT} textAnchor="middle">
            {t("diagram.on")}
          </text>
          <Lane x={14} />
          {[20, 30, 40, 50, 60].map((y) => note(16, y, 36, 4, MUTED))}
          <Lane x={82} />
          {[20, 26, 32, 44, 60].map((y) => note(84, y, 36, 4, NOTE))}
          <line
            x1={82}
            y1={38}
            x2={122}
            y2={38}
            stroke={ACCENT}
            strokeWidth={1.2}
            strokeDasharray="3 2"
          />
        </Frame>
      );
    case "bpmScroll":
      return (
        <Frame>
          <text x={34} y={13} fontSize={7} fill={MUTED} textAnchor="middle">
            {t("diagram.off")}
          </text>
          <text x={102} y={13} fontSize={7} fill={ACCENT} textAnchor="middle">
            {t("diagram.on")}
          </text>
          <Lane x={14} />
          {[20, 30, 40].map((y) => note(16, y, 36, 4, MUTED))}
          <line x1={14} y1={45} x2={54} y2={45} stroke={ACCENT} strokeWidth={1.2} />
          {[49, 54, 59, 64].map((y) => note(16, y, 36, 3, MUTED))}
          <Lane x={82} />
          {[20, 30, 40].map((y) => note(84, y, 36, 4, NOTE))}
          <line x1={82} y1={45} x2={122} y2={45} stroke={ACCENT} strokeWidth={1.2} />
          {[50, 60].map((y) => note(84, y, 36, 4, NOTE))}
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
      const w = value == null ? 14 : Math.max(5, Math.min(26, (value / 100) * 15));
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
            {note(68 - w / 2, 12, w, 5, NOTE_ALT)}
            {note(68 - w / 2, 50, w, 5, NOTE_ALT)}
          </Playfield>
          <ArrowH x1={68 - w / 2} x2={68 + w / 2} y={35} />
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
            {t("diagram.nudged")}
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
