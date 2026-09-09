import { useEffect, useState } from "react";
import type { AudioOnset } from "../lib/bpmDetect";

const cache = new WeakMap<AudioBuffer, AudioOnset[]>();
export function useOnsets(buffer: AudioBuffer | null, enabled: boolean) {
  const [state, setState] = useState<{ buffer: AudioBuffer | null; onsets: AudioOnset[]; busy: boolean; error: string }>({ buffer: null, onsets: [], busy: false, error: "" });
  useEffect(() => {
    if (!enabled || !buffer) return;
    const cached = cache.get(buffer);
    if (cached) { setState({ buffer, onsets: cached, busy: false, error: "" }); return; }
    setState({ buffer, onsets: [], busy: true, error: "" });
    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL("../lib/onset.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ onsets?: AudioOnset[]; error?: string }>) => {
        const onsets = event.data.onsets ?? [];
        if (!event.data.error) cache.set(buffer, onsets);
        setState({ buffer, onsets, busy: false, error: event.data.error ?? "" });
        worker?.terminate();
      };
      worker.onerror = () => { setState({ buffer, onsets: [], busy: false, error: "Audio analysis failed. Reopen suggestions to retry." }); worker?.terminate(); };
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
      worker.postMessage({ channels, sampleRate: buffer.sampleRate }, channels.map(c => c.buffer));
    } catch {
      setState({ buffer, onsets: [], busy: false, error: "Audio analysis could not start. Reopen suggestions to retry." });
    }
    return () => worker?.terminate();
  }, [buffer, enabled]);
  return state.buffer === buffer ? state : { onsets: [], busy: enabled && !!buffer, error: "" };
}
