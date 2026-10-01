import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowActive } from "../hooks/useWindowActive";
import { setHoldConfirmMs, setParallaxStrength } from "../lib/interfaceFeel";
import { setLaneColourScheme } from "../lib/laneColours";
import { setPerformanceMode } from "../lib/performanceMode";
import { loadPreferences, savePreferences } from "../lib/persistence";
import {
  clearUiBreakpointAttributes,
  syncUiBreakpointAttributes,
} from "../lib/uiBreakpoints";
import {
  installUiSoundInteractions,
  setUiSoundVolume,
  setUiSoundsEnabled,
} from "../lib/uiSounds";
import type { AppSettings } from "../types";
import { normalizeAppSettings } from "./appSettings";

/**
 * The app's settings: loaded from this device, saved a moment after each
 * change, and pushed into the modules that read them outside React (lane
 * colours, hold-to-confirm timing, parallax, performance mode, UI sounds and
 * the interface scale). Also works out the output volume, which drops to the
 * unfocused level while another window is in front.
 */
export function useAppSettings() {
  const [appSettings, setAppSettings] = useState<AppSettings>(() => ({
    ...normalizeAppSettings(loadPreferences()),
  }));
  const appSettingsRef = useRef(appSettings);
  // Like osu!, everything Cascade plays drops to the unfocused level while
  // another window or tab is in front, playtest included.
  const windowActive = useWindowActive();
  const outputVolume =
    appSettings.masterVolume * (windowActive ? 1 : appSettings.unfocusedVolume);
  appSettingsRef.current = appSettings;
  /** Which of a song's two names every display in the editor reaches for. */
  const preferOriginalMetadata = appSettings.preferOriginalMetadata;
  // Set before the children render so every playfield drawing picks it up.
  setLaneColourScheme(appSettings.colourblindLanes ? "colourblind" : "default");
  // Read from pointer handlers and dialogs that never see these props.
  setHoldConfirmMs(appSettings.holdConfirmMs);
  setParallaxStrength(appSettings.parallaxStrength);
  // Layout effect so the scaled font size and the breakpoint attributes land
  // before first paint, instead of flashing an unscaled/compact header.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = `${16 * appSettings.uiScale}px`;
    const syncBreakpoints = () =>
      syncUiBreakpointAttributes(root, window.innerWidth, appSettings.uiScale);
    syncBreakpoints();
    window.addEventListener("resize", syncBreakpoints);
    return () => {
      window.removeEventListener("resize", syncBreakpoints);
      clearUiBreakpointAttributes(root);
      root.style.fontSize = previous;
    };
  }, [appSettings.uiScale]);

  useEffect(() => {
    const id = window.setTimeout(() => savePreferences(appSettings), 200);
    return () => window.clearTimeout(id);
  }, [appSettings]);

  useLayoutEffect(() => {
    setPerformanceMode(appSettings.performanceMode);
  }, [appSettings.performanceMode]);

  useEffect(() => {
    setUiSoundsEnabled(appSettings.uiSoundsEnabled);
  }, [appSettings.uiSoundsEnabled]);
  useEffect(() => {
    setUiSoundVolume(appSettings.uiSoundVolume * outputVolume);
  }, [appSettings.uiSoundVolume, outputVolume]);

  useEffect(() => {
    return installUiSoundInteractions();
  }, []);

  return {
    appSettings,
    appSettingsRef,
    outputVolume,
    preferOriginalMetadata,
    setAppSettings,
  };
}
