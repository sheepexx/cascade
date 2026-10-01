import { memo } from "react";
import { lazyWithPreload } from "../lib/lazyPreload";

/**
 * Every surface the app loads on demand, and the order they are fetched in
 * ahead of use. Components that render often are wrapped in memo here, once.
 */

export const loadEditorWorkspace = () => import("../components/EditorWorkspace");
export const BottomTimeline = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.BottomTimeline })),
);
export const CommentsSidebar = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.CommentsSidebar })),
);
export const DifficultySidebar = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.DifficultySidebar })),
);
export const ManiaEditor = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.ManiaEditor })),
);
export const PlaytestNpsGraph = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PlaytestNpsGraph })),
);
export const PlaytestOverlay = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PlaytestOverlay })),
);
export const PlaytestRunStats = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PlaytestRunStats })),
);
export const PPCounter = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PPCounter })),
);
export const TransportBar = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.TransportBar })),
);
export const SharedMapPage = lazyWithPreload(() =>
  import("../components/SharedMapPage").then((m) => ({
    default: m.SharedMapPage,
  })),
);
export const SettingsModal = lazyWithPreload(() =>
  import("../components/menus/SettingsModal").then((m) => ({
    default: m.SettingsModal,
  })),
);
export const AppSettingsModal = lazyWithPreload(() =>
  import("../components/menus/AppSettingsModal").then((m) => ({
    default: m.AppSettingsModal,
  })),
);
export const SkinModal = lazyWithPreload(() =>
  import("../components/menus/SkinModal").then((m) => ({
    default: m.SkinModal,
  })),
);
export const DifficultyModal = lazyWithPreload(() =>
  import("../components/menus/DifficultyModal").then((m) => ({
    default: m.DifficultyModal,
  })),
);
export const TimingModal = lazyWithPreload(() =>
  import("../components/menus/TimingModal").then((m) => ({
    default: m.TimingModal,
  })),
);
export const SvModal = lazyWithPreload(() =>
  import("../components/menus/SvModal").then((m) => ({ default: m.SvModal })),
);
export const ToolsModal = lazyWithPreload(() =>
  import("../components/menus/ToolsModal").then((m) => ({
    default: m.ToolsModal,
  })),
);
export const MapCardModal = lazyWithPreload(() =>
  import("../components/menus/MapCardModal").then((m) => ({
    default: m.MapCardModal,
  })),
);
export const MapCardPrompt = lazyWithPreload(() =>
  import("../components/menus/MapCardPrompt").then((m) => ({
    default: m.MapCardPrompt,
  })),
);
export const AiModModal = lazyWithPreload(() =>
  import("../components/menus/AiModModal").then((m) => ({
    default: m.AiModModal,
  })),
);
export const WelcomeModal = lazyWithPreload(() =>
  import("../components/menus/StartModal").then((m) => ({
    default: m.WelcomeModal,
  })),
);
export const SampleMapsModal = lazyWithPreload(() =>
  import("../components/menus/StartModal").then((m) => ({
    default: m.SampleMapsModal,
  })),
);
export const MyMapsModal = lazyWithPreload(() =>
  import("../components/menus/MyMapsModal").then((m) => ({
    default: m.MyMapsModal,
  })),
);
export const ImportModal = lazyWithPreload(() =>
  import("../components/menus/ImportModal").then((m) => ({
    default: m.ImportModal,
  })),
);
export const NewMapModal = lazyWithPreload(() =>
  import("../components/menus/NewMapModal").then((m) => ({
    default: m.NewMapModal,
  })),
);
export const PresetBrowserModal = lazyWithPreload(() =>
  import("../components/menus/PresetBrowserModal").then((m) => ({
    default: m.PresetBrowserModal,
  })),
);
export const PublishPresetModal = lazyWithPreload(() =>
  import("../components/menus/PublishPresetModal").then((m) => ({
    default: m.PublishPresetModal,
  })),
);
export const FeedbackModal = lazyWithPreload(() =>
  import("../components/menus/FeedbackModal").then((m) => ({
    default: m.FeedbackModal,
  })),
);
export const HistoryModal = lazyWithPreload(() =>
  import("../components/menus/HistoryModal").then((m) => ({
    default: m.HistoryModal,
  })),
);
export const ShareModal = lazyWithPreload(() =>
  import("../components/menus/ShareModal").then((m) => ({
    default: m.ShareModal,
  })),
);
export const PackBrowserModal = lazyWithPreload(() =>
  import("../components/menus/PackBrowserModal").then((m) => ({
    default: m.PackBrowserModal,
  })),
);
export const AutoTimePrompt = lazyWithPreload(() =>
  import("../components/AutoTimePrompt").then((m) => ({
    default: m.AutoTimePrompt,
  })),
);
export const PackCreator = lazyWithPreload(() =>
  import("../components/PackCreator").then((m) => ({ default: m.PackCreator })),
);
export const EditorLayoutOverlay = lazyWithPreload(() =>
  import("../components/EditorLayoutOverlay").then((m) => ({
    default: m.EditorLayoutOverlay,
  })),
);
export const AudioSetupModal = lazyWithPreload(() =>
  import("../components/menus/AudioSetupModal").then((m) => ({
    default: m.AudioSetupModal,
  })),
);
/** The format readers load when a file is opened, not with the app. */
export const loadOsuImport = () => import("../lib/osuImport");
/** Desktop-only: editing a difficulty's .osu in a text editor. */
export const loadExternalEdit = () => import("../lib/externalEdit");
export const BackupsModal = lazyWithPreload(() =>
  import("../components/menus/BackupsModal").then((m) => ({
    default: m.BackupsModal,
  })),
);

export const AdminPanel = lazyWithPreload(() =>
  import("../components/admin/AdminPanel").then((m) => ({
    default: m.AdminPanel,
  })),
);

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/**
 * Fetches the split-out surfaces so none suspends on first open, in two
 * waves. The editor and the ways into a map come straight after the first
 * paint, under the session intro, which waits for them. Everything else
 * waits for an idle moment, so it does not compete with the start screen's
 * animations or the first click. The admin panel is left to load when an
 * admin opens it.
 */
export function preloadLazyChunks(): Promise<unknown> {
  const first = Promise.allSettled(
    [
      BottomTimeline,
      CommentsSidebar,
      DifficultySidebar,
      ManiaEditor,
      PlaytestNpsGraph,
      PlaytestOverlay,
      PlaytestRunStats,
      PPCounter,
      TransportBar,
      WelcomeModal,
      SampleMapsModal,
      MyMapsModal,
      ImportModal,
      NewMapModal,
    ].map((component) => component.preload()),
  );
  void first.then(() => {
    const later = () => {
      for (const component of [
        SettingsModal,
        AppSettingsModal,
        SkinModal,
        DifficultyModal,
        TimingModal,
        SvModal,
        ToolsModal,
        MapCardModal,
        MapCardPrompt,
        AiModModal,
        PresetBrowserModal,
        PublishPresetModal,
        FeedbackModal,
        HistoryModal,
        ShareModal,
        PackBrowserModal,
        AutoTimePrompt,
        PackCreator,
        BackupsModal,
        EditorLayoutOverlay,
        AudioSetupModal,
      ]) {
        void component.preload().catch(() => {});
      }
    };
    const idle = window as IdleWindow;
    if (idle.requestIdleCallback) idle.requestIdleCallback(later, { timeout: 5000 });
    else window.setTimeout(later, 2000);
  });
  return first;
}

export const MemoizedManiaEditor = memo(ManiaEditor);
export const MemoizedBottomTimeline = memo(BottomTimeline);
export const MemoizedDifficultySidebar = memo(DifficultySidebar);
export const MemoizedPPCounter = memo(PPCounter);
export const MemoizedPlaytestNpsGraph = memo(PlaytestNpsGraph);
