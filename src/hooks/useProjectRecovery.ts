import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  recoveryRecorder,
  type BackupReason,
  type RecoveryChart,
  type RecoveryMedia,
} from "../lib/recovery";
import { RecoverySession, type SessionClock } from "../lib/recoverySession";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

const browserClock: SessionClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  idle: (run) => {
    const idle = window as IdleWindow;
    if (!idle.requestIdleCallback) {
      run();
      return () => {};
    }
    const id = idle.requestIdleCallback(run, { timeout: 1500 });
    return () => idle.cancelIdleCallback?.(id);
  },
};

/**
 * Keeps the open project in the recovery store (see lib/recovery and
 * lib/recoverySession) while it is edited. Edits only mark the project dirty;
 * the write happens once editing pauses, in idle time, and right away when the
 * page is hidden or the editor unmounts, so recovery never sits in the way of
 * an edit.
 *
 * `chart` and `media` are read by reference and must keep their identity
 * between renders unless they actually changed.
 */
export function useProjectRecovery({
  enabled,
  projectId,
  chart,
  media,
  onClosedUnsaved,
}: {
  enabled: boolean;
  projectId: string;
  chart: RecoveryChart;
  media: RecoveryMedia;
  /** A project with unsaved work was replaced by another one. */
  onClosedUnsaved?: (title: string) => void;
}) {
  const onClosedRef = useRef(onClosedUnsaved);
  onClosedRef.current = onClosedUnsaved;
  const session = useMemo(() => {
    const recorder = recoveryRecorder();
    return recorder
      ? new RecoverySession(recorder, browserClock, (title) => onClosedRef.current?.(title))
      : null;
  }, []);

  useLayoutEffect(() => {
    session?.track({ projectId, chart, media, enabled });
  }, [session, projectId, chart, media, enabled]);

  useEffect(() => {
    if (!session) return;
    const flushNow = () => void session.flushPending();
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      // Unmounting is also how a crash ends: the error boundary drops the
      // editor, and this is the last chance to keep what it held.
      flushNow();
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const recorder = recoveryRecorder();
    const timer = window.setTimeout(() => {
      void recorder?.prune(projectId).catch(() => {});
    }, 10_000);
    return () => window.clearTimeout(timer);
    // Pruning once a session is enough; the open project is only spared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const noteEdit = useCallback((forProject?: string) => session?.noteEdit(forProject), [session]);
  const saveToken = useCallback(() => session?.saveToken() ?? 0, [session]);
  const markSaved = useCallback(
    (forProject: string, token: number) => {
      void session?.markSaved(forProject, token).catch(() => {});
    },
    [session],
  );
  const backup = useCallback(
    (reason: BackupReason) => session?.backup(reason) ?? Promise.resolve(false),
    [session],
  );
  const flush = useCallback(() => session?.flush() ?? Promise.resolve(), [session]);

  return { noteEdit, saveToken, markSaved, backup, flush };
}
