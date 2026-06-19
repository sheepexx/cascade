import { MAX_KEYS, MIN_KEYS, type Difficulty } from "../../types";
import { Modal } from "../ui/Modal";
import { Field, NumberInput, TextInput } from "../ui/Controls";

type Props = {
  open: boolean;
  onClose: () => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
};

/** Per-difficulty settings: name, key count, HP, OD. */
export function DifficultyModal({
  open,
  onClose,
  difficulty,
  onDifficulty,
}: Props) {
  const set = <K extends keyof Difficulty>(key: K, value: Difficulty[K]) =>
    onDifficulty({ ...difficulty, [key]: value });

  return (
    <Modal open={open} onClose={onClose} title="Difficulty">
      <div className="flex flex-col gap-4">
        <Field label="Difficulty name">
          <TextInput
            value={difficulty.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <Field
          label={`Key count (${MIN_KEYS}K – ${MAX_KEYS}K)`}
          hint="Exported as CircleSize. Reducing this removes notes in dropped lanes."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={MIN_KEYS}
              max={MAX_KEYS}
              step={1}
              value={difficulty.keyCount}
              onChange={(e) => set("keyCount", Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            />
            <NumberInput
              min={MIN_KEYS}
              max={MAX_KEYS}
              step={1}
              value={difficulty.keyCount}
              onChange={(e) =>
                set(
                  "keyCount",
                  clampInt(
                    e.target.value,
                    MIN_KEYS,
                    MAX_KEYS,
                    difficulty.keyCount,
                  ),
                )
              }
              className="w-20"
            />
          </div>
        </Field>

        <Field label={`HP Drain Rate - ${difficulty.hpDrainRate.toFixed(1)}`}>
          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={difficulty.hpDrainRate}
            onChange={(e) => set("hpDrainRate", Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
          />
        </Field>

        <Field
          label={`Overall Difficulty - ${difficulty.overallDifficulty.toFixed(
            1,
          )}`}
        >
          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={difficulty.overallDifficulty}
            onChange={(e) => set("overallDifficulty", Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
          />
        </Field>
      </div>
    </Modal>
  );
}

function clampInt(
  v: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
