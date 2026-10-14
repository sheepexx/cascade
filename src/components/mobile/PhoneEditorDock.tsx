import { useEffect, useState } from "react";
import type { AudioController } from "../../hooks/useAudio";
import { useT } from "../../lib/i18n";
import { formatTime, parseTimestamp, stepToSnap } from "../../lib/timing";
import { FREE_SNAP, MAX_SCROLL_SPEED, MIN_SCROLL_SPEED, SNAP_OPTIONS, type TimingPoint, type ViewState } from "../../types";
import { Button, Field, TextInput, Slider } from "../ui/Controls";
import { Modal } from "../ui/Modal";
import { Dropdown } from "../ui/Dropdown";
import { PhoneIcon } from "./PhoneIcon";

export type PhoneTool = "move" | "note" | "select" | "erase";
export function PhoneEditorDock({ tool, onTool, focus, onFocus, audio, hasAudio, view, onView, timingPoints, canEdit, canUndo, canRedo, onUndo, onRedo, selectionCount, onSelection, onTools, onTimeline, jumpOpen, onJumpOpen }: {
  tool: PhoneTool; onTool: (tool: PhoneTool) => void; focus: boolean; onFocus: () => void;
  audio: AudioController; hasAudio: boolean; view: ViewState; onView: (view: ViewState) => void; timingPoints: TimingPoint[];
  canEdit: boolean; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  selectionCount: number; onSelection: () => void; onTools: () => void; onTimeline: () => void;
  jumpOpen: boolean; onJumpOpen: (open: boolean) => void;
}) {
  const t = useT();
  const [panel, setPanel] = useState<"playback" | "modes" | null>(null);
  const [jumpDraft, setJumpDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const { getCurrentTime } = audio;
  useEffect(() => {
    if (jumpOpen) { setJumpDraft(formatTime(getCurrentTime())); setInvalid(false); }
  }, [jumpOpen, getCurrentTime]);
  const jump = () => { setJumpDraft(formatTime(audio.getCurrentTime())); setInvalid(false); onJumpOpen(true); };
  const modes = <div className="phone-modes grid grid-cols-4 gap-1">
    {(["move", "note", "select", "erase"] as const).map(mode => <button type="button" key={mode} disabled={!canEdit && (mode === "note" || mode === "erase")} aria-pressed={tool === mode} onClick={() => { onTool(mode); setPanel(null); }} className={`phone-mode flex flex-col items-center justify-center gap-1 rounded-md py-1.5 text-xs ${tool === mode ? "bg-white/[0.09] text-slate-50" : "text-slate-400"}`}>
      <PhoneIcon name={mode} />{t(`mobile.${mode}`)}
    </button>)}
  </div>;
  return <>
    <footer role="toolbar" className={`phone-editor-dock shrink-0 border-t border-white/[0.06] bg-ink-800 px-2 ${focus ? "is-focused" : ""}`} aria-label={t("mobile.editorControls")}>
      <div className="flex items-center gap-1">
        {focus && <button type="button" className="phone-icon-button" aria-label={t("mobile.chooseTool")} onClick={() => setPanel("modes")}><PhoneIcon name={tool} /></button>}
        <button type="button" className="phone-icon-button" disabled={!canUndo} aria-label={t("mobile.undo")} onClick={onUndo}><PhoneIcon name="undo" /></button>
        {!focus && <button type="button" className="phone-icon-button" disabled={!canRedo} aria-label={t("mobile.redo")} onClick={onRedo}><PhoneIcon name="redo" /></button>}
        <button type="button" className="phone-icon-button" disabled={!hasAudio} aria-label={audio.isPlaying ? t("app.pausePlayback") : t("app.playAudio")} onClick={audio.toggle}><PhoneIcon name={audio.isPlaying ? "pause" : "play"} /></button>
        <button type="button" onClick={jump} aria-label={t("app.jumpToTime")} className="min-w-0 flex-1 truncate px-1 font-mono text-xs tabular-nums">{formatTime(audio.currentTime)}</button>
        <button type="button" className="phone-icon-button text-xs" aria-label={t("mobile.playbackOptions")} onClick={() => setPanel("playback")}>{view.snapDivisor === FREE_SNAP ? t("transport.snapFree") : `1/${view.snapDivisor}`}</button>
        <button type="button" className="phone-icon-button" aria-label={t("mobile.allTools")} onClick={onTools}><PhoneIcon name="more" /></button>
      </div>
      {!focus && modes}
      {selectionCount > 0 && <button type="button" aria-label={t("mobile.selectionActions")} onClick={onSelection} className="phone-selection-button flex w-full items-center justify-between gap-2 border-t border-white/[0.06] px-2 text-sm text-amber-200"><span>{t("editor.selected", { count: selectionCount })}</span><span>{t("mobile.selectionActions")}</span></button>}
    </footer>
    <Modal open={panel === "modes"} title={t("mobile.chooseTool")} onClose={() => setPanel(null)}>{modes}</Modal>
    <Modal open={panel === "playback"} title={t("mobile.playbackOptions")} onClose={() => setPanel(null)}>
      <div className="flex flex-col gap-5">
        <Field label={t("transport.snap")}><Dropdown aria-label={t("transport.snap")} value={view.snapDivisor} options={SNAP_OPTIONS.map(value => ({ value, label: value === FREE_SNAP ? t("transport.snapFree") : `1/${value}` }))} onChange={snapDivisor => onView({ ...view, snapDivisor })} /></Field>
        <Field label={`${t("transport.scrollSpeed")}: ${view.scrollSpeed}`}><Slider aria-label={t("transport.scrollSpeed")} min={MIN_SCROLL_SPEED} max={MAX_SCROLL_SPEED} step={1} value={view.scrollSpeed} onChange={scrollSpeed => onView({ ...view, scrollSpeed })} /></Field>
        <Field label={t("settings.rate")}><Dropdown aria-label={t("settings.rate")} value={audio.playbackRate} options={[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(value => ({ value, label: `${Math.round(value * 100)}%` }))} onChange={audio.setPlaybackRate} /></Field>
        <div className="grid grid-cols-2 gap-2"><Button onClick={() => audio.seek(Math.max(0, stepToSnap(audio.getCurrentTime(), timingPoints, view.snapDivisor, -1)))}>{t("mobile.previousBeat")}</Button><Button onClick={() => audio.seek(stepToSnap(audio.getCurrentTime(), timingPoints, view.snapDivisor, 1))}>{t("mobile.nextBeat")}</Button></div>
        <Button onClick={() => { setPanel(null); onTimeline(); }}>{t("mobile.timeline")}</Button>
        <Button onClick={() => { setPanel(null); onFocus(); }}>{focus ? t("mobile.leaveFocus") : t("mobile.focus")}</Button>
      </div>
    </Modal>
    <Modal open={jumpOpen} title={t("app.jumpToTime")} onClose={() => onJumpOpen(false)} footer={<Button variant="accent" onClick={() => { const ms = parseTimestamp(jumpDraft); if (ms === null) { setInvalid(true); return; } audio.seek(ms); onJumpOpen(false); }}>{t("transport.goTo")}</Button>}>
      <Field label={t("mobile.timestamp")}><TextInput aria-label={t("mobile.timestamp")} value={jumpDraft} placeholder="mm:ss.ms" aria-invalid={invalid} onChange={e => { setJumpDraft(e.target.value); setInvalid(false); }} /></Field>
      {invalid && <p role="alert" className="mt-2 text-rose-300">{t("mobile.invalidTime")}</p>}
    </Modal>
  </>;
}
