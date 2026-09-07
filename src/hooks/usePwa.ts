import { useCallback, useSyncExternalStore } from "react";
import {
  applyPendingUpdate,
  canInstall,
  isStandalone,
  isUpdateReady,
  promptInstall,
  subscribePwa,
} from "../lib/pwa";

export function usePwa() {
  const installable = useSyncExternalStore(
    subscribePwa,
    canInstall,
    () => false,
  );
  const updateReady = useSyncExternalStore(
    subscribePwa,
    isUpdateReady,
    () => false,
  );
  const standalone = useSyncExternalStore(
    subscribePwa,
    isStandalone,
    () => false,
  );

  const install = useCallback(() => {
    void promptInstall();
  }, []);

  return { installable, updateReady, standalone, install, applyPendingUpdate };
}
