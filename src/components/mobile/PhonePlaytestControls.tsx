import { useT } from "../../lib/i18n";
import { PhoneIcon } from "./PhoneIcon";
import { useSyncExternalStore } from "react";
import type { HeldKeysStore } from "../../hooks/usePlaytestInput";

export function PhonePlaytestControls({ keyCount, paused, ended, autoplay, ready, heldKeys, keys, onPause, onReturn, onTools, onAutoplay, onPress, onRelease }: {
  keyCount: number; paused: boolean; ended: boolean; autoplay: boolean;
  ready: boolean; heldKeys: HeldKeysStore; keys: string[];
  onPause: () => void; onReturn: () => void; onTools: () => void; onAutoplay: () => void;
  onPress: (pointerId: number, column: number, stamp: number) => void;
  onRelease: (pointerId: number, stamp: number) => void;
}) {
  const t = useT();
  const held = useSyncExternalStore(heldKeys.subscribe, heldKeys.getSnapshot);
  return <div className="pointer-events-none absolute inset-0 z-[45]">
    <div className="pointer-events-auto absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-ink-900/95 p-1">
      <button type="button" className="phone-icon-button" aria-label={t("mobile.pausePlaytest")} onClick={onPause}><PhoneIcon name={paused ? "play" : "pause"} /></button>
      <button type="button" className="phone-icon-button px-2 text-xs" aria-pressed={autoplay} onClick={onAutoplay}>{t("mobile.autoplay")}</button>
      <button type="button" className="phone-icon-button" aria-label={t("mobile.allTools")} onClick={onTools}><PhoneIcon name="more" /></button>
      <button type="button" className="phone-icon-button px-2 text-xs" onClick={onReturn}>{t("common.back")}</button>
    </div>
    {!paused && !ended && <div className="phone-playtest-keys pointer-events-auto absolute inset-x-0 bottom-0 grid gap-px bg-ink-900/95" style={{ gridTemplateColumns: `repeat(${keyCount}, minmax(0, 1fr))` }}>
      {Array.from({ length: keyCount }, (_, col) => <button type="button" key={col} disabled={!ready} aria-pressed={held.has(keys[col] || `Touch${col + 1}`)} aria-label={t("mobile.playLane", { lane: col + 1 })} className="min-w-0 touch-none border-t border-white/[0.12] py-4 text-xs text-slate-300 aria-pressed:bg-accent/25 disabled:opacity-40" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onPress(e.pointerId, col, e.timeStamp); }} onPointerMove={e => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const rect = e.currentTarget.parentElement!.getBoundingClientRect();
        const next = Math.max(0, Math.min(keyCount - 1, Math.floor((e.clientX - rect.left) / rect.width * keyCount)));
        onPress(e.pointerId, next, e.timeStamp);
      }} onPointerUp={e => { onRelease(e.pointerId, e.timeStamp); e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={e => onRelease(e.pointerId, e.timeStamp)} onLostPointerCapture={e => onRelease(e.pointerId, e.timeStamp)}>{col + 1}</button>)}
    </div>}
  </div>;
}
