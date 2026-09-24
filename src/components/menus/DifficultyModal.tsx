import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { MAX_KEYS, MIN_KEYS, type Difficulty } from "../../types";
import { Modal } from "../ui/Modal";
import { Slider, TextInput } from "../ui/Controls";
import { maniaJudgementWindows } from "../../lib/playtestJudgements";
import { defaultLaneColour, laneColourSet } from "../../lib/laneColours";

type Props = {
  open: boolean;
  onClose: () => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
};

const KEY_PRESETS = [4, 5, 6, 7, 8, 9, 10] as const;
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-400";
// The cards are ink-700/40 over the modal; slider thumbs ring in that colour.
const CARD_SURFACE = { "--slider-surface": "#1a1a23" } as CSSProperties;

type Windows = ReturnType<typeof maniaJudgementWindows>;
const JUDGEMENTS: { key: keyof Windows; label: string; color: string }[] = [
  { key: "miss", label: "Miss", color: "#f87171" },
  { key: "hit50", label: "50", color: "#a78bfa" },
  { key: "hit100", label: "100", color: "#60a5fa" },
  { key: "hit200", label: "200", color: "#4ade80" },
  { key: "hit300", label: "300", color: "#facc15" },
  { key: "max", label: "MAX", color: "#f8fafc" },
];
const WIDEST_WINDOW = maniaJudgementWindows(0).miss;

export function DifficultyModal({
  open,
  onClose,
  difficulty,
  onDifficulty,
}: Props) {
  const set = <K extends keyof Difficulty>(key: K, value: Difficulty[K]) =>
    onDifficulty({ ...difficulty, [key]: value });

  // Lowering the key count deletes every note in the dropped lanes, so a
  // choice that would do that waits here for a second click to confirm.
  const [pendingKeys, setPendingKeys] = useState<number | null>(null);
  useEffect(() => setPendingKeys(null), [open, difficulty.id]);

  const laneCounts = useMemo(() => {
    const counts = new Array<number>(MAX_KEYS).fill(0);
    for (const note of difficulty.notes) {
      if (note.column >= 0 && note.column < MAX_KEYS) counts[note.column]++;
    }
    return counts;
  }, [difficulty.notes]);

  const keyCount = difficulty.keyCount;
  const notesFrom = (lane: number) =>
    laneCounts.slice(lane).reduce((sum, n) => sum + n, 0);

  const chooseKeys = (keys: number) => {
    const next = Math.max(MIN_KEYS, Math.min(MAX_KEYS, keys));
    if (next === keyCount) return setPendingKeys(null);
    if (next < keyCount && notesFrom(next) > 0) return setPendingKeys(next);
    setPendingKeys(null);
    set("keyCount", next);
  };

  const shownKeys = pendingKeys ?? keyCount;
  const removing = pendingKeys === null ? 0 : notesFrom(pendingKeys);
  const hp = difficulty.hpDrainRate;
  const od = difficulty.overallDifficulty;
  const windows = maniaJudgementWindows(od);

  return (
    <Modal open={open} onClose={onClose} title="Difficulty" width="max-w-xl">
      <div className="flex flex-col gap-4" style={CARD_SURFACE}>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Name</span>
          <TextInput
            value={difficulty.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Hard"
            className="py-2.5 text-base font-semibold"
          />
        </label>

        <section className="rounded-xl border border-white/10 bg-ink-700/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className={LABEL}>Keys</span>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                Exported as CircleSize. Lowering it removes the notes in the
                lanes it drops.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <StepButton
                label="One key fewer"
                disabled={shownKeys <= MIN_KEYS}
                onClick={() => chooseKeys(shownKeys - 1)}
              >
                −
              </StepButton>
              <span className="w-14 text-center text-2xl font-bold tabular-nums text-slate-50">
                {shownKeys}K
              </span>
              <StepButton
                label="One key more"
                disabled={shownKeys >= MAX_KEYS}
                onClick={() => chooseKeys(shownKeys + 1)}
              >
                +
              </StepButton>
            </div>
          </div>

          <LaneMeter
            lanes={Math.max(keyCount, shownKeys)}
            keys={shownKeys}
            counts={laneCounts}
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {KEY_PRESETS.map((keys) => (
              <button
                key={keys}
                type="button"
                onClick={() => chooseKeys(keys)}
                aria-pressed={keys === shownKeys}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums transition duration-[var(--motion-quick)] active:scale-95 ${
                  keys === shownKeys
                    ? "border-accent/60 bg-accent/90 text-white"
                    : "border-white/10 bg-ink-700/60 text-slate-300 hover:bg-ink-600 hover:text-slate-100"
                }`}
              >
                {keys}K
              </button>
            ))}
          </div>

          {pendingKeys !== null && (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
            >
              <span className="min-w-0 flex-1">
                {pendingKeys}K drops{" "}
                {pendingKeys + 1 === keyCount
                  ? `lane ${keyCount}`
                  : `lanes ${pendingKeys + 1}–${keyCount}`}
                , removing {removing} note{removing === 1 ? "" : "s"}.
              </span>
              <button
                type="button"
                onClick={() => setPendingKeys(null)}
                className="rounded-md px-2 py-1 font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Keep {keyCount}K
              </button>
              <button
                type="button"
                onClick={() => {
                  set("keyCount", pendingKeys);
                  setPendingKeys(null);
                }}
                className="rounded-md bg-rose-500/80 px-2 py-1 font-semibold text-white transition hover:bg-rose-500"
              >
                Remove notes
              </button>
            </div>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="HP drain"
            value={hp}
            onChange={(v) => set("hpDrainRate", v)}
            detail={describeHp(hp)}
          >
            <HpMeter value={hp} />
          </StatCard>
          <StatCard
            label="Overall difficulty"
            value={od}
            onChange={(v) => set("overallDifficulty", v)}
            detail={`A 300 needs ±${ms(windows.hit300)} ms, a MAX ±${ms(
              windows.max,
            )} ms.`}
          >
            <JudgementWindows windows={windows} />
          </StatCard>
        </div>
      </div>
    </Modal>
  );
}

/** One column per lane, filled by its share of the notes, coloured like a
 *  mania playfield; lanes a pending key count would drop show in red. */
function LaneMeter({
  lanes,
  keys,
  counts,
}: {
  lanes: number;
  keys: number;
  counts: number[];
}) {
  let peak = 1;
  for (let i = 0; i < lanes; i++) peak = Math.max(peak, counts[i]);
  return (
    <div className="mt-4 flex h-20 gap-1 rounded-lg border border-white/5 bg-ink-900/60 p-1.5">
      {Array.from({ length: lanes }, (_, lane) => {
        const dropped = lane >= keys;
        const color = dropped ? "#f43f5e" : laneColor(lane, keys);
        const share = counts[lane] / peak;
        return (
          <div
            key={lane}
            title={`Lane ${lane + 1}: ${counts[lane]} note${counts[lane] === 1 ? "" : "s"}`}
            className="relative flex-1 overflow-hidden rounded-[5px] transition-colors duration-[var(--motion-quick)]"
            style={{ backgroundColor: `${color}${dropped ? "26" : "14"}` }}
          >
            <div
              className="lane-meter-fill absolute inset-x-0 bottom-0 rounded-[5px]"
              style={{
                height: `${counts[lane] ? Math.max(6, share * 100) : 0}%`,
                backgroundColor: color,
                opacity: dropped ? 0.85 : 0.75,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** White and blue mirrored in from both edges; odd key counts use the
 *  editor's own layout, blue at the edges around a gold centre lane. */
function laneColor(lane: number, keys: number): string {
  if (keys % 2 === 1) return defaultLaneColour(lane, keys);
  const fromEdge = Math.min(lane, keys - 1 - lane);
  const { white, accent } = laneColourSet();
  return fromEdge % 2 === 0 ? white : accent;
}

function StatCard({
  label,
  value,
  onChange,
  detail,
  children,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-ink-700/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className={LABEL}>{label}</span>
        <span className="text-2xl font-bold leading-none tabular-nums text-slate-50">
          {value.toFixed(1)}
        </span>
      </div>
      {children}
      <Slider
        min={0}
        max={10}
        step={0.1}
        value={value}
        onChange={onChange}
        aria-label={label}
        aria-valuetext={value.toFixed(1)}
      />
      <p className="text-[11px] leading-snug text-slate-400">{detail}</p>
    </section>
  );
}

function HpMeter({ value }: { value: number }) {
  return (
    <div className="flex h-2.5 gap-1" aria-hidden>
      {Array.from({ length: 10 }, (_, cell) => (
        <span
          key={cell}
          className="relative flex-1 overflow-hidden rounded-full bg-white/[0.07]"
        >
          <span
            className="lane-meter-fill absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.max(0, Math.min(1, value - cell)) * 100}%`,
              backgroundColor:
                cell < 4 ? "#34d399" : cell < 7 ? "#fbbf24" : "#fb7185",
            }}
          />
        </span>
      ))}
    </div>
  );
}

/** Every judgement window nested around the hit, widest first, all to the
 *  scale of the widest window osu!mania has (a miss at OD 0). */
function JudgementWindows({ windows }: { windows: Windows }) {
  return (
    <div
      className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.07]"
      title={JUDGEMENTS.map((j) => `${j.label} ±${ms(windows[j.key])} ms`)
        .reverse()
        .join(" · ")}
    >
      {JUDGEMENTS.map((j) => (
        <span
          key={j.key}
          className="judgement-window absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: `${(windows[j.key] / WIDEST_WINDOW) * 100}%`,
            backgroundColor: j.color,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-600/70 text-lg leading-none text-slate-200 transition duration-[var(--motion-quick)] hover:bg-ink-500/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

function describeHp(hp: number): string {
  if (hp < 3) return "Forgiving: misses cost little health.";
  if (hp < 6) return "Balanced: a few misses in a row are survivable.";
  if (hp < 8) return "Strict: each miss takes a big bite out of health.";
  return "Punishing: a short run of misses fails the play.";
}

function ms(value: number): string {
  return String(Math.round(value * 10) / 10);
}
