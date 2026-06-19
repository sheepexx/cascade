import { useEffect, useRef } from "react";
import type { ManiaNote, TimingPoint } from "../types";
import {
  HITSOUND_CLAP,
  HITSOUND_FINISH,
  HITSOUND_WHISTLE,
} from "../types";
import { activeTimingAt } from "../lib/timing";

/** Lowercase set prefixes indexed by sample-set number (1=normal,2=soft,3=drum). */
const SET_PREFIX: Record<number, string> = { 1: "normal", 2: "soft", 3: "drum" };

/** Build the public URL for a bundled default sample, e.g. `soft-hitclap`. */
function sampleUrl(setPrefix: string, sound: string): string {
  return `/hitsounds/${setPrefix}-hit${sound}.wav`;
}

/**
 * Plays a map's actual osu! hitsounds during playback preview.
 *
 * For every note crossing the judgement line (note heads and long-note tails),
 * it resolves the effective sample set, additions, and volume from the note's
 * own hit-sample data falling back to the active timing point - exactly like
 * osu!mania - and plays the matching bundled samples (normal/soft/drum ×
 * normal/whistle/finish/clap).
 *
 * Detection runs in song-time, so it stays accurate at reduced playback speeds.
 * Custom per-note sample files / indices (keysounds) are preserved on
 * import/export but are not played back here; the default sets are used.
 */
export function useHitsounds(
  currentTime: number,
  isPlaying: boolean,
  notes: ManiaNote[],
  timingPoints: TimingPoint[],
  /** Perceived slider position, 0..1 (square-law applied internally). */
  volume: number,
  enabled: boolean,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  // Decoded sample buffers keyed by `${setPrefix}-${sound}` (e.g. `soft-clap`).
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  // Keys currently being fetched/decoded, so we don't request them twice.
  const loadingRef = useRef<Set<string>>(new Set());
  // Sorted hit events (note heads + long-note tails) carrying the source note.
  const eventsRef = useRef<{ time: number; note: ManiaNote }[]>([]);
  // Last playhead position we've already emitted hits up to.
  const lastTimeRef = useRef<number | null>(null);

  // Keep the latest values on a ref so the rAF loop reads fresh data.
  const stateRef = useRef({ currentTime, isPlaying, timingPoints, volume, enabled });
  stateRef.current = { currentTime, isPlaying, timingPoints, volume, enabled };

  // Rebuild the sorted hit-event index whenever the notes change.
  useEffect(() => {
    const events: { time: number; note: ManiaNote }[] = [];
    for (const n of notes) {
      events.push({ time: n.startTime, note: n });
      if (n.endTime !== undefined) events.push({ time: n.endTime, note: n });
    }
    events.sort((a, b) => a.time - b.time);
    eventsRef.current = events;
  }, [notes]);

  useEffect(() => {
    if (!enabled) {
      lastTimeRef.current = null;
      return;
    }

    let raf = 0;

    const ensureCtx = (): AudioContext | null => {
      let ctx = ctxRef.current;
      if (!ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    };

    /** Fetch + decode a sample if not already available; returns it if ready. */
    const getBuffer = (
      ctx: AudioContext,
      setPrefix: string,
      sound: string,
    ): AudioBuffer | null => {
      const key = `${setPrefix}-${sound}`;
      const existing = buffersRef.current.get(key);
      if (existing) return existing;
      if (!loadingRef.current.has(key)) {
        loadingRef.current.add(key);
        void fetch(sampleUrl(setPrefix, sound))
          .then((r) => r.arrayBuffer())
          .then((buf) => ctx.decodeAudioData(buf))
          .then((decoded) => buffersRef.current.set(key, decoded))
          .catch(() => {
            /* missing / unsupported - that sample stays silent */
          })
          .finally(() => loadingRef.current.delete(key));
      }
      return null;
    };

    const playSample = (
      ctx: AudioContext,
      setPrefix: string,
      sound: string,
      gainValue: number,
    ) => {
      if (gainValue <= 0) return;
      const buffer = getBuffer(ctx, setPrefix, sound);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(gain).connect(ctx.destination);
      src.start();
    };

    const playNote = (note: ManiaNote) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      const s = stateRef.current;
      const tp = activeTimingAt(note.startTime, s.timingPoints);
      // Resolve the effective sample sets. 0 = auto: notes fall back to the
      // timing point's set, which itself falls back to Normal (the General
      // default SampleSet). Additions fall back to the normal set.
      const normalSet = note.sampleSet || tp.sampleSet || 1;
      const additionSet = note.additionSet || normalSet;
      const normalPrefix = SET_PREFIX[normalSet] ?? "normal";
      const additionPrefix = SET_PREFIX[additionSet] ?? "normal";
      // Volume: per-note overrides the timing point; 0 means "inherit".
      const volPct = note.sampleVolume || tp.volume || 100;
      const perceived = s.volume * s.volume; // square law, matches playback vol
      const gainValue = perceived * (volPct / 100);
      if (gainValue <= 0) return;

      // The normal sample always plays in osu!mania; additions layer on top.
      playSample(ctx, normalPrefix, "normal", gainValue);
      const adds = note.hitSound ?? 0;
      if (adds & HITSOUND_WHISTLE) playSample(ctx, additionPrefix, "whistle", gainValue);
      if (adds & HITSOUND_FINISH) playSample(ctx, additionPrefix, "finish", gainValue);
      if (adds & HITSOUND_CLAP) playSample(ctx, additionPrefix, "clap", gainValue);
    };

    // Warm up the most common sample so the first hit isn't dropped.
    const warm = ensureCtx();
    if (warm) getBuffer(warm, "normal", "normal");

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (!s.isPlaying) {
        lastTimeRef.current = null;
        return;
      }
      const cur = s.currentTime;
      const last = lastTimeRef.current;
      lastTimeRef.current = cur;
      // First frame after starting, or a backward / large forward jump (a seek):
      // re-anchor without machine-gunning every note we skipped over.
      if (last === null || cur < last || cur - last > 250) return;

      const events = eventsRef.current;
      if (events.length === 0) return;

      // Emit every event in (last, cur]. Binary-search the first index > last.
      let lo = 0;
      let hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid].time <= last) lo = mid + 1;
        else hi = mid;
      }
      let played = 0;
      for (let i = lo; i < events.length && events[i].time <= cur; i++) {
        // Cap simultaneous hits so dense chords don't clip the output.
        if (played >= 6) break;
        playNote(events[i].note);
        played++;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  // Release the audio context when the component using the hook unmounts.
  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
      buffersRef.current.clear();
    };
  }, []);
}
