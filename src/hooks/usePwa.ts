import { useSyncExternalStore } from "react";
import {
  applyPendingUpdate,
  isStandalone,
  isUpdateReady,
  subscribePwa,
} from "../lib/pwa";

export function usePwa() {
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

  return { updateReady, standalone, applyPendingUpdate };
}
