import { useEffect, useRef, useState } from "react";
import type { FeatureFlags } from "../lib/featureFlags";
import { fetchFeatureFlags, loadCachedFlags } from "../lib/featureFlags";
import { subscribeSupabase } from "../lib/supabase";

/**
 * Admin kill switches. The cached copy renders instantly, then the fetch and
 * a realtime subscription keep it current. Fails open (see lib/featureFlags).
 */
export function useFeatureFlags() {
  const [featureFlags, setFeatureFlags] =
    useState<FeatureFlags>(loadCachedFlags);
  const featureFlagsRef = useRef(featureFlags);
  featureFlagsRef.current = featureFlags;
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchFeatureFlags().then((flags) => {
        if (!cancelled) setFeatureFlags(flags);
      });
    };
    refresh();
    const unsubscribe = subscribeSupabase((supabase) =>
      supabase
        .channel("feature-flags")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "feature_flags" },
          refresh,
        )
        .subscribe(),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    featureFlags,
    featureFlagsRef,
  };
}
