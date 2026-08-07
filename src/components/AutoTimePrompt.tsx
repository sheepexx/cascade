import type { BpmDetection } from "../lib/bpmDetect";
import { Button } from "./ui/Controls";
import { TimedNotification } from "./ui/TimedNotification";

export type AutoTimeStatus = "idle" | "detecting" | "done" | "failed";

type Props = {
  open: boolean;
  status: AutoTimeStatus;
  /** Whether the dropped audio has finished decoding. */
  ready: boolean;
  fileName: string | null;
  result: BpmDetection | null;
  onRun: () => void;
  onDismiss: () => void;
};

const BAR_HEIGHTS = [10, 18, 14, 22, 12];

export function AutoTimePrompt({
  open,
  status,
  ready,
  fileName,
  result,
  onRun,
  onDismiss,
}: Props) {
  const confidenceLabel =
    result === null
      ? ""
      : result.confidence >= 0.5
        ? "confident"
        : result.confidence >= 0.3
          ? "plausible"
          : "uncertain";

  return (
    <TimedNotification
      open={open}
      durationMs={
        status === "done" ? 4000 : status === "failed" ? 6000 : null
      }
      onDismiss={onDismiss}
      resetKey={fileName}
      placement="bottom-center"
      showProgress={status !== "idle"}
      progressClassName={
        status === "done"
          ? "bg-emerald-400"
          : status === "failed"
            ? "bg-slate-400"
            : "bg-accent"
      }
      className="fixed bottom-24 left-1/2 z-50 flex items-center gap-4 rounded-2xl border border-white/10 bg-ink-800/90 py-4 pb-5 pl-5 pr-4 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      {({ dismiss }) => (
        <>
        <div className="flex h-7 items-end gap-[3px]" aria-hidden>
          {BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className={`loader-bar w-[4px] rounded-full ${
                status === "done"
                  ? "bg-emerald-400"
                  : status === "failed"
                    ? "bg-slate-500"
                    : "bg-accent"
              }`}
              style={{
                height: `${h}px`,
                animationDelay: `${i * 110}ms`,
                animationDuration: status === "detecting" ? "480ms" : "1300ms",
                animationPlayState:
                  status === "done" || status === "failed"
                    ? "paused"
                    : "running",
              }}
            />
          ))}
        </div>

        {status === "done" && result !== null ? (
          <div className="min-w-0">
            <div className="text-sm font-semibold text-emerald-300">
              ✓ Timed at {result.bpm} BPM
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              offset {result.offsetMs} ms · {confidenceLabel} · fine-tune in
              the Timing menu
            </div>
          </div>
        ) : status === "failed" ? (
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-200">
              Couldn't find a steady beat
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              You can still tap it out in the Timing menu.
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100">
              Auto-time this song?
            </div>
            <div className="mt-0.5 max-w-[16rem] truncate text-xs text-slate-400">
              {fileName ? `${fileName} · ` : ""}detects BPM and offset from the
              audio
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {(status === "idle" || status === "detecting") && (
            <>
              <Button
                variant="accent"
                onClick={onRun}
                disabled={!ready || status === "detecting"}
              >
                {status === "detecting"
                  ? "Listening..."
                  : ready
                    ? "Auto-time"
                    : "Decoding..."}
              </Button>
              <Button onClick={() => dismiss()} disabled={status === "detecting"}>
                Not now
              </Button>
            </>
          )}
          {(status === "done" || status === "failed") && (
            <Button onClick={() => dismiss()}>Close</Button>
          )}
        </div>
        </>
      )}
    </TimedNotification>
  );
}
