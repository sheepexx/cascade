import { useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "../../hooks/useAudio";
import { supportsExclusiveAudio } from "../../lib/nativeAudio";
import { CALIBRATION_DURATION_MS, CALIBRATION_FIRST_MS, CALIBRATION_BEAT_MS, calibrationResult, calibrationTap, createCalibrationBuffer } from "../../lib/audioCalibration";
import { Modal } from "../ui/Modal";
import { Button, Select } from "../ui/Controls";
import { InfoTip } from "../ui/Tooltip";
import { useT } from "../../lib/i18n";

export function AudioSetupModal({ exclusive, onExclusive, currentOffset, onApplyOffset, onClose }: {
  exclusive: boolean; onExclusive: (value: boolean) => void; currentOffset: number;
  onApplyOffset: (value: number) => void; onClose: () => void;
}) {
  const t = useT();
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
    const blur = () => { controller.current.pause(); setPhase("intro"); setMessage(t("audioSetup.pausedBlur")); };
    window.addEventListener("keydown", key, true); window.addEventListener("blur", blur);
    const timer = window.setInterval(() => { if (controller.current.getCurrentTime() >= CALIBRATION_DURATION_MS - 40) { controller.current.pause(); setPhase("result"); } }, 50);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur); clearInterval(timer); };
  }, [phase, t]);
  useEffect(() => () => controller.current.pause(), []);
  const start = () => {
    setTaps({}); setMessage(""); audio.seek(0); audio.setVolume(0.65); audio.play(); setPhase("running"); tapButton.current?.focus();
  };
  const beat = Math.floor((audio.currentTime - CALIBRATION_FIRST_MS) / CALIBRATION_BEAT_MS);
  const loading = audio.nativeAudio.selected && !audio.nativeAudio.ready;
  return <Modal open onClose={onClose} title={t("audioSetup.title")} width="max-w-xl" footer={<Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>}>
    <label className="flex flex-col gap-2 text-xs text-slate-300">{t("audioSetup.outputMode")}<Select disabled={phase === "running"} value={exclusive ? "exclusive" : "shared"} onChange={e => { audio.pause(); setPhase("intro"); setTaps({}); onExclusive(e.target.value === "exclusive"); }}>
      <option value="shared">{t("audioSetup.sharedOption")}</option><option value="exclusive" disabled={!supportsExclusiveAudio()}>{t("audioSetup.exclusiveOption")}</option>
    </Select></label>
    <p className="mt-2 text-[11px] text-slate-400">{t("audioSetup.exclusiveHint")}</p>
    <p role="status" className="mt-3 text-xs text-teal-200">{loading ? t("audioSetup.opening") : audio.nativeAudio.selected ? t("audioSetup.deviceBuffer", { device: audio.nativeAudio.device ?? "", ms: audio.nativeAudio.latencyMs?.toFixed(1) ?? "" }) : t("audioSetup.sharedStatus")}</p>
    {audio.nativeAudio.fallbackReason && <p role="alert" className="mt-2 rounded-lg bg-amber-300/10 p-3 text-xs text-amber-200">{audio.nativeAudio.fallbackReason} {t("audioSetup.sharedActive")}</p>}
    <div className="flex items-center gap-1.5 my-5 rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">{t("audioSetup.findOffset")}<InfoTip content={<>
        <p className="m-0">{t("audioSetup.info1")}</p>
        <p className="mt-2">{t("audioSetup.info2")}</p>
        <p className="mt-2">{t("audioSetup.info3")}</p>
      </>} /></h3>
      <p className="mt-2 text-xs text-slate-500">{t("audioSetup.currentOffset", { ms: currentOffset })}</p>
      {phase === "running" ? <div className="mt-4 text-center">
        <p className="mb-3 text-sm text-teal-100">{beat < 0 ? t("audioSetup.getReady") : beat < 4 ? t("audioSetup.warmup", { n: beat + 1 }) : t("audioSetup.captured", { n: Object.keys(taps).length })}</p>
        <button ref={tapButton} className="w-full rounded-xl border border-teal-300/30 bg-teal-300/10 py-8 text-lg font-semibold text-teal-100 active:bg-teal-300/25" onPointerDown={e => { e.preventDefault(); tap(); }}>{t("audioSetup.tapSpace")}</button>
        <Button className="mt-3" variant="ghost" onClick={() => { audio.pause(); setPhase("intro"); }}>{t("audioSetup.cancelRun")}</Button>
      </div> : <Button className="mt-4" variant="accent" disabled={loading} onClick={start}>{phase === "result" ? t("audioSetup.tryAgain") : t("audioSetup.start")}</Button>}
      {phase === "result" && <div role="status" className="mt-4 text-xs text-slate-300">{result ? <>
        <p className="text-lg font-semibold text-teal-100">{t("audioSetup.suggested", { ms: `${result.offsetMs > 0 ? "+" : ""}${result.offsetMs}` })}</p>
        <p className="mt-2">{t("audioSetup.stats", { kept: result.kept, spread: result.spreadMs, discarded: result.discarded })}</p>
        {result.reliable ? <Button className="mt-3" variant="primary" onClick={() => { onApplyOffset(result.offsetMs); setMessage(t("audioSetup.appliedMsg")); }}>{t("audioSetup.applyOffset")}</Button> : <p className="mt-2 text-amber-200">{t("audioSetup.needMore")}</p>}
      </> : <p>{t("audioSetup.notEnough")}</p>}</div>}
    </div>
    <p role="status" className="text-xs text-teal-200">{message}</p>
  </Modal>;
}
