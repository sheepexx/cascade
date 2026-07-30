import { useEffect, useMemo, useRef } from "react";
import type { HumanizeSettings, ManiaNote, SkillSettings } from "../types";
import {
  EMPTY_PLAN,
  planAutoplay,
  summarizePlan,
  type AutoplayPlan,
  type AutoplayPlanSummary,
} from "../lib/autoplay";
import {
  EMPTY_PROFILE,
  computeSkillProfile,
  type SkillProfile,
} from "../lib/playerSkill";
import type { JudgementWindows } from "../lib/playtestJudgements";
import { resolveSkillForKeyCount } from "../lib/danSkill";

export function usePlaytestAutoplay({
  enabled,
  active,
  paused,
  ended,
  notes,
  keyCount,
  humanize,
  skill,
  windows,
  releaseWindows,
  rate,
  getCurrentTime,
  onPress,
  onRelease,
  runKey,
}: {
  enabled: boolean;
  active: boolean;
  paused: boolean;
  ended: boolean;
  notes: ManiaNote[];
  keyCount: number;
  humanize: HumanizeSettings;
  skill: SkillSettings;
  windows: JudgementWindows;
  releaseWindows: JudgementWindows;
  rate: number;
  getCurrentTime: () => number;
  onPress: (column: number, atMs: number, noteId: string) => void;
  onRelease: (column: number, atMs: number, noteId: string) => void;
  runKey: number;
}): {
  plan: AutoplayPlan;
  summary: AutoplayPlanSummary;
  profile: SkillProfile;
} {
  const effectiveSkill = useMemo(
    () => resolveSkillForKeyCount(skill, keyCount),
    [skill, keyCount],
  );

  const profile = useMemo(() => {
    if (!effectiveSkill.enabled || notes.length === 0) return EMPTY_PROFILE;
    return computeSkillProfile(notes, keyCount, effectiveSkill, rate);
  }, [effectiveSkill, notes, keyCount, rate]);

  const plan = useMemo(() => {
    if (!enabled || !active || notes.length === 0) return EMPTY_PLAN;
    return planAutoplay(notes, {
      humanize,
      windows,
      releaseWindows,
      profile,
      rate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    active,
    notes,
    humanize,
    windows,
    releaseWindows,
    profile,
    rate,
    runKey,
  ]);

  const summary = useMemo(() => summarizePlan(plan), [plan]);

  const cursorRef = useRef(0);
  const handlers = useRef({ onPress, onRelease, getCurrentTime });
  handlers.current = { onPress, onRelease, getCurrentTime };

  useEffect(() => {
    if (!enabled || !active || paused || ended) return;
    if (plan.events.length === 0) return;

    {
      const now = handlers.current.getCurrentTime();
      let lo = 0;
      while (lo < plan.events.length && plan.events[lo].atMs <= now) lo++;
      cursorRef.current = lo;
    }

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { onPress: press, onRelease: release, getCurrentTime: now } =
        handlers.current;
      const time = now();

      if (
        cursorRef.current > 0 &&
        time < plan.events[cursorRef.current - 1].atMs
      ) {
        let lo = 0;
        while (lo < plan.events.length && plan.events[lo].atMs <= time) lo++;
        cursorRef.current = lo;
      }

      while (
        cursorRef.current < plan.events.length &&
        plan.events[cursorRef.current].atMs <= time
      ) {
        const event = plan.events[cursorRef.current];
        cursorRef.current += 1;
        if (event.action === "press") {
          press(event.column, event.atMs, event.noteId);
        } else {
          release(event.column, event.atMs, event.noteId);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, active, paused, ended, plan]);

  return { plan, summary, profile };
}
