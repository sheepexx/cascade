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
import { playNativeEffect } from "../lib/nativeAudio";

const SET_PREFIX: Record<number, string> = { 1: "normal", 2: "soft", 3: "drum" };
const HIT_SOUNDS = ["normal", "whistle", "finish", "clap"] as const;
const DEFAULT_SAMPLE_BASES = Object.values(SET_PREFIX).flatMap((setPrefix) =>
  HIT_SOUNDS.map((sound) => `${setPrefix}-hit${sound}`),
);

function sampleUrl(base: string): string {
  return `${import.meta.env.BASE_URL}hitsounds/${base}.wav`;
}

export function useHitsounds(
  getCurrentTime: () => number,
  isPlaying: boolean,
  notes: ManiaNote[],
  timingPoints: TimingPoint[],
  volume: number,
  enabled: boolean,
  ducked: boolean,
  skinHitsounds: LoadedSkin["hitsounds"] | null,
  ready: boolean,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());
  const eventsRef = useRef<{ time: number; note: ManiaNote }[]>([]);
  const lastTimeRef = useRef<number | null>(null);

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

  const ensureCtx = useCallback((resume = true): AudioContext | null => {
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
    if (resume && ctx.state === "suspended") void ctx.resume();
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

  useEffect(() => {
    if (!enabled || !ready) {
      eventsRef.current = [];
      return;
    }
    const events: { time: number; note: ManiaNote }[] = [];
    for (const n of notes) {
      events.push({ time: n.startTime, note: n });
    }
    events.sort((a, b) => a.time - b.time);
    eventsRef.current = events;
  }, [enabled, notes, ready]);

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
      if (playNativeEffect(buffer, gainValue * currentMixPower())) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(gain).connect(
        filterRef.current ?? masterGainRef.current ?? ctx.destination,
      );
      src.start();
    },
    [getBuffer, currentMixPower],
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
    if (!enabled || !ready) return;
    let cancelled = false;
    let timer = 0;
    let idleId: number | null = null;
    const requestIdle = (
      window as typeof window & {
        requestIdleCallback?: (callback: () => void) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;
    const cancelIdle = (
      window as typeof window & {
        cancelIdleCallback?: (id: number) => void;
      }
    ).cancelIdleCallback;
    const prioritized = [
      "normal-hitnormal",
      "soft-hitnormal",
      "drum-hitnormal",
      ...DEFAULT_SAMPLE_BASES,
      ...Object.keys(stateRef.current.skinHitsounds ?? {}),
    ];
    const bases = [...new Set(prioritized)];
    let index = 0;

    const schedule = (callback: () => void) => {
      if (requestIdle) {
        idleId = requestIdle.call(window, callback);
      } else {
        timer = window.setTimeout(callback, 50);
      }
    };
    const warmNext = () => {
      idleId = null;
      if (cancelled || index >= bases.length) return;
      if (stateRef.current.isPlaying) {
        timer = window.setTimeout(() => schedule(warmNext), 250);
        return;
      }
      const ctx = ensureCtx(false);
      if (!ctx) return;
      getBuffer(ctx, bases[index++]);
      applyOutputMix(0.01);
      schedule(warmNext);
    };

    timer = window.setTimeout(() => schedule(warmNext), 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleId !== null && cancelIdle) cancelIdle.call(window, idleId);
    };
  }, [enabled, ready, skinHitsounds, ensureCtx, getBuffer, applyOutputMix]);

  useEffect(() => {
    if (!enabled || !ready || !isPlaying) {
      lastTimeRef.current = null;
      return;
    }

    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cur = getCurrentTime();
      const last = lastTimeRef.current;
      lastTimeRef.current = cur;
      if (last === null || cur < last || cur - last > 250) return;

      const events = eventsRef.current;
      if (events.length === 0) return;

      let lo = 0;
      let hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid].time <= last) lo = mid + 1;
        else hi = mid;
      }
      let played = 0;
      for (let i = lo; i < events.length && events[i].time <= cur; i++) {
        if (played >= 6) break;
        playNote(events[i].note);
        played++;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lastTimeRef.current = null;
    };
  }, [enabled, getCurrentTime, isPlaying, playNote, ready]);

  useEffect(() => {
    const buffers = buffersRef.current;
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
      masterGainRef.current = null;
      filterRef.current = null;
      buffers.clear();
    };
  }, []);

  return { playNote };
}
