import { useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "../../hooks/useAudio";
import { supportsExclusiveAudio } from "../../lib/nativeAudio";
import { CALIBRATION_DURATION_MS, CALIBRATION_FIRST_MS, CALIBRATION_BEAT_MS, calibrationResult, calibrationTap, createCalibrationBuffer } from "../../lib/audioCalibration";
import { Modal } from "../ui/Modal";
import { Button, Select } from "../ui/Controls";
import { InfoTip } from "../ui/Tooltip";

export function AudioSetupModal({ exclusive, onExclusive, currentOffset, onApplyOffset, onClose }: {
  exclusive: boolean; onExclusive: (value: boolean) => void; currentOffset: number;
  onApplyOffset: (value: number) => void; onClose: () => void;
}) {
  const [buffer] = useState(createCalibrationBuffer);
  const audio = useAudio(null, CALIBRATION_DURATION_MS, buffer, null, 1, false, exclusive);
  const [phase, setPhase] = useState<"intro" | "running" | "result">("intro");
  const [taps, setTaps] = useState<Record<number, number>>({});
  const [message, setMessage] = useState("");
  const controller = useRef(audio); controller.current = audio;
  const tapButton = useRef<HTMLButtonElement>(null);
  const result = useMemo(() => calibrationResult(Object.values(taps)), [taps]);
  const tap = () => {
    if (phase !== "running") return;
    const sample = calibrationTap(controller.current.getCurrentTime());
    if (sample) setTaps(prev => prev[sample.beat] === undefined ? { ...prev, [sample.beat]: sample.errorMs } : prev);
  };
  const tapRef = useRef(tap); tapRef.current = tap;
  useEffect(() => {
    if (phase !== "running") return;
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); e.stopImmediatePropagation(); tapRef.current();
    };
    const blur = () => { controller.current.pause(); setPhase("intro"); setMessage("Calibration paused because the window lost focus. Start again when ready."); };
    window.addEventListener("keydown", key, true); window.addEventListener("blur", blur);
    const timer = window.setInterval(() => { if (controller.current.getCurrentTime() >= CALIBRATION_DURATION_MS - 40) { controller.current.pause(); setPhase("result"); } }, 50);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur); clearInterval(timer); };
  }, [phase]);
  useEffect(() => () => controller.current.pause(), []);
  const start = () => {
    setTaps({}); setMessage(""); audio.seek(0); audio.setVolume(0.65); audio.play(); setPhase("running"); tapButton.current?.focus();
  };
  const beat = Math.floor((audio.currentTime - CALIBRATION_FIRST_MS) / CALIBRATION_BEAT_MS);
  const loading = audio.nativeAudio.selected && !audio.nativeAudio.ready;
  return <Modal open onClose={onClose} title="Audio setup & calibration" width="max-w-xl" footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
    <label className="flex flex-col gap-2 text-xs text-slate-300">Output mode<Select disabled={phase === "running"} value={exclusive ? "exclusive" : "shared"} onChange={e => { audio.pause(); setPhase("intro"); setTaps({}); onExclusive(e.target.value === "exclusive"); }}>
      <option value="shared">Shared audio (Web Audio)</option><option value="exclusive" disabled={!supportsExclusiveAudio()}>WASAPI exclusive · Windows desktop</option>
    </Select></label>
    <p className="mt-2 text-[11px] text-slate-400">Exclusive mode takes control of the default Windows output, so other apps may be silent until you switch back. Pitch-preserving playback always uses shared audio.</p>
    <p role="status" className="mt-3 text-xs text-teal-200">{loading ? "Opening the audio device…" : audio.nativeAudio.selected ? `${audio.nativeAudio.device} · ${audio.nativeAudio.latencyMs?.toFixed(1)} ms buffer` : "Shared audio · low-latency interactive playback"}</p>
    {audio.nativeAudio.fallbackReason && <p role="alert" className="mt-2 rounded-lg bg-amber-300/10 p-3 text-xs text-amber-200">{audio.nativeAudio.fallbackReason} Shared audio is active.</p>}
    <div className="flex items-center gap-1.5 my-5 rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">Find your timing offset<InfoTip content={<>
        <p className="m-0">Listen to four warm-up clicks, then tap Space with each of the next 16 clicks. Follow the sound.</p>
        <p className="mt-2">This estimates your tap alignment, including input and output delay. It is not a direct hardware latency measurement.</p>
        <p className="mt-2">Recalibrate after changing headphones, output device or audio mode.</p>
      </>} /></h3>
      <p className="mt-2 text-xs text-slate-500">Current playtest offset: {currentOffset} ms.</p>
      {phase === "running" ? <div className="mt-4 text-center">
        <p className="mb-3 text-sm text-teal-100">{beat < 0 ? "Get ready…" : beat < 4 ? `Warm-up ${beat + 1} / 4` : `${Object.keys(taps).length} / 16 taps captured`}</p>
        <button ref={tapButton} className="w-full rounded-xl border border-teal-300/30 bg-teal-300/10 py-8 text-lg font-semibold text-teal-100 active:bg-teal-300/25" onPointerDown={e => { e.preventDefault(); tap(); }}>Tap · Space</button>
        <Button className="mt-3" variant="ghost" onClick={() => { audio.pause(); setPhase("intro"); }}>Cancel run</Button>
      </div> : <Button className="mt-4" variant="accent" disabled={loading} onClick={start}>{phase === "result" ? "Try again" : "Start calibration"}</Button>}
      {phase === "result" && <div role="status" className="mt-4 text-xs text-slate-300">{result ? <>
        <p className="text-lg font-semibold text-teal-100">Suggested offset: {result.offsetMs > 0 ? "+" : ""}{result.offsetMs} ms</p>
        <p className="mt-2">{result.kept} consistent taps · {result.spreadMs} ms spread · {result.discarded} outliers excluded</p>
        {result.reliable ? <Button className="mt-3" variant="primary" onClick={() => { onApplyOffset(result.offsetMs); setMessage("Applied to playtest audio offset. Map timing is unchanged."); }}>Apply offset</Button> : <p className="mt-2 text-amber-200">Try again for at least 12 consistent taps before applying an offset.</p>}
      </> : <p>Not enough taps were captured. Try again, tapping with the sound.</p>}</div>}
    </div>
    <p role="status" className="text-xs text-teal-200">{message}</p>
  </Modal>;
}
