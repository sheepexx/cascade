import { useCallback, useEffect, useRef } from "react";
import type { LoadedSkin, ManiaNote, TimingPoint } from "../types";
import {
  HITSOUND_CLAP,
  HITSOUND_FINISH,
  HITSOUND_WHISTLE,
} from "../types";
import {
  DUCK_FILTER_HZ,
  MIX_RAMP_SECONDS,
  NORMAL_FILTER_HZ,
  effectiveAudioPower,
} from "../lib/audioAtmosphere";
import { activeTimingAt } from "../lib/timing";

/** Lowercase set prefixes indexed by sample-set number (1=normal,2=soft,3=drum). */
const SET_PREFIX: Record<number, string> = { 1: "normal", 2: "soft", 3: "drum" };
const HIT_SOUNDS = ["normal", "whistle", "finish", "clap"] as const;
const DEFAULT_SAMPLE_BASES = Object.values(SET_PREFIX).flatMap((setPrefix) =>
  HIT_SOUNDS.map((sound) => `${setPrefix}-hit${sound}`),
);

/** Build the public URL for a bundled default sample, e.g. `soft-hitclap`. */
function sampleUrl(base: string): string {
  return `${import.meta.env.BASE_URL}hitsounds/${base}.wav`;
}

/**
 * Plays a map's actual osu! hitsounds during playback preview.
 *
 * For every note head crossing the judgement line (long-note tails are silent,
 * as in osu!mania), it resolves the effective sample set, additions, and volume
 * from the note's
 * own hit-sample data falling back to the active timing point - exactly like
 * osu!mania - and plays the matching bundled samples (normal/soft/drum ×
 * normal/whistle/finish/clap).
 *
 * Detection runs in song-time, so it stays accurate at reduced playback speeds.
 * If the active skin includes osu!-named hitsound files (e.g.
 * `normal-hitnormal.wav` or `soft-hitclap2.ogg`) those samples override the
 * bundled defaults. Custom per-note sample files (keysounds) are preserved on
 * import/export but are not played back here.
 */
export function useHitsounds(
  getCurrentTime: () => number,
  isPlaying: boolean,
  notes: ManiaNote[],
  timingPoints: TimingPoint[],
  /** Perceived slider position, 0..1 (square-law applied internally). */
  volume: number,
  enabled: boolean,
  ducked: boolean,
  skinHitsounds: LoadedSkin["hitsounds"] | null,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  // Decoded sample buffers keyed by source (`skin:soft-hitclap2`, etc.).
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  // Keys currently being fetched/decoded, so we don't request them twice.
  const loadingRef = useRef<Set<string>>(new Set());
  // Sorted hit events (note heads + long-note tails) carrying the source note.
  const eventsRef = useRef<{ time: number; note: ManiaNote }[]>([]);
  // Last playhead position we've already emitted hits up to.
  const lastTimeRef = useRef<number | null>(null);

  // Keep the latest values on a ref so the rAF loop reads fresh data.
  const stateRef = useRef({
    isPlaying,
    timingPoints,
    volume,
    enabled,
    ducked,
    skinHitsounds,
  });
  stateRef.current = {
    isPlaying,
    timingPoints,
    volume,
    enabled,
    ducked,
    skinHitsounds,
  };

  const currentMixPower = useCallback((): number => {
    const s = stateRef.current;
    return s.enabled ? effectiveAudioPower(s.volume, s.ducked) : 0;
  }, []);

  const ensureCtx = useCallback((): AudioContext | null => {
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
    if (!filterRef.current || !masterGainRef.current) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = stateRef.current.ducked
        ? DUCK_FILTER_HZ
        : NORMAL_FILTER_HZ;
      filter.Q.value = 0.65;
      const masterGain = ctx.createGain();
      masterGain.gain.value = currentMixPower();
      filter.connect(masterGain);
      masterGain.connect(ctx.destination);
      filterRef.current = filter;
      masterGainRef.current = masterGain;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }, [currentMixPower]);

  const applyOutputMix = useCallback(
    (seconds = MIX_RAMP_SECONDS) => {
      const ctx = ctxRef.current;
      const masterGain = masterGainRef.current;
      const filter = filterRef.current;
      if (!ctx || !masterGain || !filter) return;
      const now = ctx.currentTime;
      const targetGain = currentMixPower();
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(targetGain, now + seconds);
      const targetHz = stateRef.current.ducked
        ? DUCK_FILTER_HZ
        : NORMAL_FILTER_HZ;
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(Math.max(40, filter.frequency.value), now);
      filter.frequency.exponentialRampToValueAtTime(targetHz, now + seconds);
    },
    [currentMixPower],
  );

  // Rebuild the sorted hit-event index whenever the notes change.
  useEffect(() => {
    const events: { time: number; note: ManiaNote }[] = [];
    for (const n of notes) {
      // Only note heads play a hitsound. A long note's tail is a release, not a
      // hit, so it stays silent — matching osu!mania.
      events.push({ time: n.startTime, note: n });
    }
    events.sort((a, b) => a.time - b.time);
    eventsRef.current = events;
  }, [notes]);

  useEffect(() => {
    if (!enabled) lastTimeRef.current = null;
    applyOutputMix();
  }, [enabled, volume, ducked, applyOutputMix]);

  useEffect(() => {
    buffersRef.current.clear();
    loadingRef.current.clear();
  }, [skinHitsounds]);

  const sourceFor = useCallback(
    (
      base: string,
      fallbackBase = base.replace(/\d+$/, ""),
    ):
      | { key: string; load: () => Promise<ArrayBuffer> }
      | null => {
      const skinSamples = stateRef.current.skinHitsounds;
      const skinHit = skinSamples?.[base] ?? skinSamples?.[fallbackBase];
      if (skinHit) {
        const key = `skin:${skinSamples?.[base] ? base : fallbackBase}`;
        return { key, load: () => skinHit.arrayBuffer() };
      }
      if (DEFAULT_SAMPLE_BASES.includes(fallbackBase)) {
        return {
          key: `default:${fallbackBase}`,
          load: () => fetch(sampleUrl(fallbackBase)).then((r) => r.arrayBuffer()),
        };
      }
      return null;
    },
    [],
  );

  const getBuffer = useCallback(
    (ctx: AudioContext, base: string): AudioBuffer | null => {
      const source = sourceFor(base);
      if (!source) return null;
      const { key } = source;
      const existing = buffersRef.current.get(key);
      if (existing) return existing;
      if (!loadingRef.current.has(key)) {
        loadingRef.current.add(key);
        void source
          .load()
          .then((buf) => ctx.decodeAudioData(buf))
          .then((decoded) => buffersRef.current.set(key, decoded))
          .catch(() => {
            /* missing / unsupported - that sample stays silent */
          })
          .finally(() => loadingRef.current.delete(key));
      }
      return null;
    },
    [sourceFor],
  );

  const playSample = useCallback(
    (
      ctx: AudioContext,
      setPrefix: string,
      sound: string,
      sampleIndex: number,
      gainValue: number,
    ) => {
      if (gainValue <= 0) return;
      const indexSuffix = sampleIndex > 1 ? String(sampleIndex) : "";
      const buffer = getBuffer(ctx, `${setPrefix}-hit${sound}${indexSuffix}`);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(gain).connect(
        filterRef.current ?? masterGainRef.current ?? ctx.destination,
      );
      src.start();
    },
    [getBuffer],
  );

  const playNote = useCallback(
    (note: ManiaNote) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      const s = stateRef.current;
      const tp = activeTimingAt(note.startTime, s.timingPoints);
      const normalSet = note.sampleSet || tp.sampleSet || 1;
      const additionSet = note.additionSet || normalSet;
      const normalPrefix = SET_PREFIX[normalSet] ?? "normal";
      const additionPrefix = SET_PREFIX[additionSet] ?? "normal";
      const sampleIndex = note.sampleIndex || tp.sampleIndex || 0;
      const volPct = note.sampleVolume || tp.volume || 100;
      const gainValue = volPct / 100;
      if (gainValue <= 0) return;

      playSample(ctx, normalPrefix, "normal", sampleIndex, gainValue);
      const adds = note.hitSound ?? 0;
      if (adds & HITSOUND_WHISTLE)
        playSample(ctx, additionPrefix, "whistle", sampleIndex, gainValue);
      if (adds & HITSOUND_FINISH)
        playSample(ctx, additionPrefix, "finish", sampleIndex, gainValue);
      if (adds & HITSOUND_CLAP)
        playSample(ctx, additionPrefix, "clap", sampleIndex, gainValue);
    },
    [ensureCtx, playSample],
  );

  useEffect(() => {
    if (!enabled) {
      lastTimeRef.current = null;
      return;
    }

    let raf = 0;

    const sourceFor = (
      base: string,
      fallbackBase = base.replace(/\d+$/, ""),
    ):
      | { key: string; load: () => Promise<ArrayBuffer> }
      | null => {
      const skinSamples = stateRef.current.skinHitsounds;
      const skinHit = skinSamples?.[base] ?? skinSamples?.[fallbackBase];
      if (skinHit) {
        const key = `skin:${skinSamples?.[base] ? base : fallbackBase}`;
        return { key, load: () => skinHit.arrayBuffer() };
      }
      if (DEFAULT_SAMPLE_BASES.includes(fallbackBase)) {
        return {
          key: `default:${fallbackBase}`,
          load: () => fetch(sampleUrl(fallbackBase)).then((r) => r.arrayBuffer()),
        };
      }
      return null;
    };

    /** Fetch + decode a sample if not already available; returns it if ready. */
    const getBuffer = (ctx: AudioContext, base: string): AudioBuffer | null => {
      const source = sourceFor(base);
      if (!source) return null;
      const { key } = source;
      const existing = buffersRef.current.get(key);
      if (existing) return existing;
      if (!loadingRef.current.has(key)) {
        loadingRef.current.add(key);
        void source
          .load()
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
      sampleIndex: number,
      gainValue: number,
    ) => {
      if (gainValue <= 0) return;
      const indexSuffix = sampleIndex > 1 ? String(sampleIndex) : "";
      const buffer = getBuffer(ctx, `${setPrefix}-hit${sound}${indexSuffix}`);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(gain).connect(
        filterRef.current ?? masterGainRef.current ?? ctx.destination,
      );
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
      const sampleIndex = note.sampleIndex || tp.sampleIndex || 0;
      // Volume: per-note overrides the timing point; 0 means "inherit". The
      // shared output chain applies the editor's overall hitsound/ducking mix.
      const volPct = note.sampleVolume || tp.volume || 100;
      const gainValue = volPct / 100;
      if (gainValue <= 0) return;

      // The normal sample always plays in osu!mania; additions layer on top.
      playSample(ctx, normalPrefix, "normal", sampleIndex, gainValue);
      const adds = note.hitSound ?? 0;
      if (adds & HITSOUND_WHISTLE)
        playSample(ctx, additionPrefix, "whistle", sampleIndex, gainValue);
      if (adds & HITSOUND_FINISH)
        playSample(ctx, additionPrefix, "finish", sampleIndex, gainValue);
      if (adds & HITSOUND_CLAP)
        playSample(ctx, additionPrefix, "clap", sampleIndex, gainValue);
    };

    // Warm up every bundled default sample, plus any skin-specific variants, so
    // the first note/chord after entering the site doesn't pay decode latency.
    const warm = ensureCtx();
    if (warm) {
      for (const base of DEFAULT_SAMPLE_BASES) getBuffer(warm, base);
      for (const base of Object.keys(stateRef.current.skinHitsounds ?? {})) {
        getBuffer(warm, base);
      }
      applyOutputMix(0.01);
    }

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (!s.isPlaying) {
        lastTimeRef.current = null;
        return;
      }
      const cur = getCurrentTime();
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
  }, [enabled, ensureCtx, applyOutputMix, skinHitsounds, getCurrentTime]);

  // Release the audio context when the component using the hook unmounts.
  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
      masterGainRef.current = null;
      filterRef.current = null;
      buffersRef.current.clear();
    };
  }, []);

  return { playNote };
}
