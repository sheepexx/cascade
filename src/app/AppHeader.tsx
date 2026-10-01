import type { Dispatch, SetStateAction } from "react";
import { AccountControl } from "../components/auth/LoginButton";
import { DesktopDownloadLink } from "../components/DesktopDownloadLink";
import { IconButton, MenuButton } from "../components/header/HeaderButtons";
import { LanguagePicker } from "../components/LanguagePicker";
import type { SettingsTab } from "../components/menus/AppSettingsModal";
import { NotificationInbox } from "../components/NotificationInbox";
import { NowPlaying } from "../components/NowPlaying";
import { HistoryPopover } from "../components/ui/HistoryPopover";
import { RedoIcon, UndoIcon } from "../components/ui/Icons";
import { Menu } from "../components/ui/Menu";
import { CommentIcon, UsersIcon } from "../components/ui/StartIcons";
import type { CollabStatus } from "../hooks/useCollab";
import type { MenuMusic } from "../hooks/useMenuMusic";
import type { AuthUser } from "../lib/auth";
import type { AccessRole } from "../lib/collab";
import type { PresencePeer } from "../lib/collabPresence";
import type { FeatureFlags } from "../lib/featureFlags";
import { MALODY_MAX_KEYS } from "../lib/formatLimits";
import { useT } from "../lib/i18n";
import type { MapCardPresetOption } from "../lib/mapCard";
import type { InboxNotification } from "../lib/notifications";
import type { OsuStatus } from "../lib/osuDesktop";
import { isDesktopApp } from "../lib/pwa";
import type { AppSettings, Difficulty } from "../types";
import type { ModalId } from "./appTypes";

/**
 * The bar along the top of the editor: the File and More menus, undo, redo and
 * history, the save badge, live session status, the notification inbox and the
 * account button. Zen mode and playtests hide it.
 */
export function AppHeader({
  active,
  appSettings,
  authUser,
  beginExternalEdit,
  canEdit,
  canExport,
  canRedo,
  canUndo,
  cloudOwnerId,
  cloudProjectId,
  cloudSaveStatus,
  collab,
  commentUnreadCount,
  dismissInboxNotification,
  exporting,
  featureFlags,
  handleCloudSave,
  handleExportMcz,
  handleExportOsu,
  handleExportOsz,
  handleExportQua,
  handleExportSm,
  handleLoadFromOsu,
  handleSave,
  handleSendToOsu,
  handleSyncToOsu,
  hasMalodyDifficulty,
  hasProject,
  historyCurrent,
  historyEntries,
  historyPanel,
  importingMap,
  jumpHistory,
  liveEnabled,
  markInboxAllRead,
  markInboxNotificationRead,
  menuMusic,
  modal,
  myRole,
  notifications,
  notificationsError,
  notificationsLoading,
  openAiMod,
  openInboxNotification,
  openMapCard,
  openSettings,
  osuApp,
  osuBusy,
  packCreatorOpen,
  preferOriginalMetadata,
  redo,
  refreshNotifications,
  saveErrorDetail,
  saveStatus,
  setCommentsOpen,
  setHistoryPanel,
  setModal,
  setShowHomeConfirm,
  sharedSlug,
  showHeader,
  undo,
}: {
  active: Difficulty;
  appSettings: AppSettings;
  authUser: AuthUser | null;
  beginExternalEdit: () => Promise<void>;
  canEdit: boolean;
  canExport: boolean;
  canRedo: boolean;
  canUndo: boolean;
  cloudOwnerId: string | null;
  cloudProjectId: string | null;
  cloudSaveStatus: "error" | "saving" | "saved" | null;
  collab: { status: CollabStatus; peers: PresencePeer[] };
  commentUnreadCount: number;
  dismissInboxNotification: (id: string) => void;
  exporting: boolean;
  featureFlags: FeatureFlags;
  handleCloudSave: (target?: { overwriteId?: string; asNewMap?: boolean; }) => Promise<void>;
  handleExportMcz: () => void;
  handleExportOsu: () => void;
  handleExportOsz: () => void;
  handleExportQua: () => void;
  handleExportSm: () => void;
  handleLoadFromOsu: () => Promise<void>;
  handleSave: (silent?: boolean) => Promise<void>;
  handleSendToOsu: () => void;
  handleSyncToOsu: () => void;
  hasMalodyDifficulty: boolean;
  hasProject: boolean;
  historyCurrent: number;
  historyEntries: string[];
  historyPanel: boolean;
  importingMap: boolean;
  jumpHistory: (index: number) => void;
  liveEnabled: boolean;
  markInboxAllRead: () => void;
  markInboxNotificationRead: (id: string) => void;
  menuMusic: MenuMusic;
  modal: ModalId;
  myRole: AccessRole;
  notifications: InboxNotification[];
  notificationsError: string | null;
  notificationsLoading: boolean;
  openAiMod: () => void;
  openInboxNotification: (notification: InboxNotification) => void;
  openMapCard: (start?: MapCardPresetOption | null) => void;
  openSettings: (tab?: SettingsTab) => void;
  osuApp: OsuStatus | null;
  osuBusy: boolean;
  packCreatorOpen: boolean;
  preferOriginalMetadata: boolean;
  redo: () => void;
  refreshNotifications: () => Promise<void>;
  saveErrorDetail: string | null;
  saveStatus: "error" | "saving" | "saved" | null;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setHistoryPanel: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<ModalId>>;
  setShowHomeConfirm: Dispatch<SetStateAction<boolean>>;
  sharedSlug: string | null;
  showHeader: boolean;
  undo: () => void;
}) {
  const t = useT();
  return (
    <header
        className={`z-30 flex items-center justify-between gap-2 overflow-hidden border-white/10 bg-ink-800/65 px-3 shadow-[0_10px_35px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[max-height,padding,opacity,transform] duration-300 ease-out uixl:gap-4 uixl:px-5 ${
            hasProject ? "" : "absolute inset-x-0 top-0"
        } ${
            showHeader
                ? "max-h-20 translate-y-0 border-b py-2.5 opacity-100"
                : "pointer-events-none max-h-0 -translate-y-full border-b-0 py-0 opacity-0"
        }`}
        aria-hidden={!showHeader}
        {...({ inert: !showHeader ? "" : undefined } as { inert?: string })}
    >
        <div className="flex min-w-0 items-center gap-2 uixl:gap-4">
            <div className="flex shrink-0 items-center gap-2.5">
                <button
                    type="button"
                    onClick={() => hasProject && setShowHomeConfirm(true)}
                    className="flex items-center gap-2.5 rounded-md transition hover:opacity-80"
                    title={hasProject ? t("home.returnTitle") : undefined}
                    data-no-uisound=""
                >
                    <img
                        src={`${import.meta.env.BASE_URL}favicon.png?v=3`}
                        alt="Cascade"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        className="h-8 w-8 select-none rounded-lg object-cover"
                    />
                    <span className="hidden text-sm font-semibold text-slate-100 uimd:inline">
                        Cascade
                    </span>
                </button>
            </div>
    
            <div
                className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
                    hasProject
                        ? "max-w-[68rem] translate-x-0 opacity-100"
                        : "pointer-events-none max-w-0 -translate-x-3 opacity-0"
                }`}
                aria-hidden={!hasProject}
                {...({ inert: !hasProject ? "" : undefined } as { inert?: string })}
            >
                <nav className="flex items-center gap-1 whitespace-nowrap">
                    <MenuButton onClick={() => setModal("mapSettings")}>
                        {t("nav.mapSettings")}
                    </MenuButton>
                    <MenuButton onClick={() => setModal("timing")}>
                        {t("nav.timing")}
                    </MenuButton>
                    {featureFlags.sv_tools && (
                        <MenuButton onClick={() => setModal("sv")}>
                            {t("nav.sv")}
                        </MenuButton>
                    )}
                    <MenuButton onClick={() => setModal("difficulty")}>
                        {t("nav.difficulty")}
                    </MenuButton>
                    <div className="hidden items-center gap-1 uixl:flex">
                        <MenuButton onClick={() => setModal("tools")}>
                            {t("nav.tools")}
                        </MenuButton>
                        <MenuButton onClick={openAiMod}>{t("nav.aiMod")}</MenuButton>
                        {appSettings.showPatternTools && (
                            <MenuButton onClick={() => setModal("presets")}>
                                {t("nav.presets")}
                            </MenuButton>
                        )}
                        <MenuButton onClick={() => setModal("skin")}>
                            {t("nav.skin")}
                        </MenuButton>
                        <MenuButton onClick={() => openSettings()}>
                            {t("nav.settings")}
                        </MenuButton>
                        <span className="mx-1 h-5 w-px bg-white/10" />
                        <HistoryPopover
                            open={historyPanel}
                            onOpenChange={setHistoryPanel}
                            available={canUndo || canRedo}
                            entries={historyEntries}
                            current={historyCurrent}
                            onJump={jumpHistory}
                            readOnly={!canEdit}
                            live={liveEnabled}
                        >
                            <IconButton
                                onClick={undo}
                                disabled={!canUndo}
                                title={t("nav.undo")}
                            >
                                <UndoIcon className="h-4 w-4" />
                            </IconButton>
                        </HistoryPopover>
                        <IconButton
                            onClick={redo}
                            disabled={!canRedo}
                            title={t("nav.redo")}
                        >
                            <RedoIcon className="h-4 w-4" />
                        </IconButton>
                    </div>
                    <div className="uixl:hidden">
                        <Menu
                            label={t("nav.more")}
                            className="!px-2.5"
                            items={[
                                {
                                    label: t("nav.tools"),
                                    onClick: () => setModal("tools"),
                                },
                                { label: t("nav.aiMod"), onClick: openAiMod },
                                ...(appSettings.showPatternTools
                                    ? [
                                            {
                                                label: t("nav.presets"),
                                                onClick: () => setModal("presets"),
                                            },
                                        ]
                                    : []),
                                {
                                    label: t("nav.skin"),
                                    onClick: () => setModal("skin"),
                                },
                                {
                                    label: t("nav.settings"),
                                    onClick: () => openSettings(),
                                },
                                { separator: true as const },
                                {
                                    label: t("nav.undo"),
                                    disabled: !canUndo,
                                    onClick: undo,
                                },
                                {
                                    label: t("nav.redo"),
                                    disabled: !canRedo,
                                    onClick: redo,
                                },
                                {
                                    label: t("undoHistory.title"),
                                    disabled: !canUndo && !canRedo,
                                    onClick: () => setModal("history"),
                                },
                            ]}
                        />
                    </div>
                </nav>
            </div>
        </div>
    
        <div className="flex shrink-0 items-center gap-3">
            <div
                className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
                    hasProject
                        ? "max-w-[68rem] translate-x-0 opacity-100"
                        : "pointer-events-none max-w-0 translate-x-3 opacity-0"
                }`}
                aria-hidden={!hasProject}
            >
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                    {cloudProjectId && myRole === "viewer" && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            {t("nav.viewOnly")}
                        </span>
                    )}
                    {cloudProjectId &&
                        authUser &&
                        cloudOwnerId === authUser.id &&
                        featureFlags.collab && (
                            <IconButton
                                onClick={() => setModal("share")}
                                title={t("nav.shareTitle")}
                            >
                                <UsersIcon className="h-4 w-4" />
                            </IconButton>
                        )}
                    {cloudProjectId && authUser && (
                        <IconButton
                            onClick={() => setCommentsOpen((v) => !v)}
                            title={
                                commentUnreadCount
                                    ? t("nav.commentsUnread", { count: commentUnreadCount })
                                    : t("nav.comments")
                            }
                        >
                            <CommentIcon className="h-4 w-4" />
                            {commentUnreadCount > 0 && (
                                <span className="absolute right-0 top-0 grid min-h-3 min-w-3 place-items-center rounded-full bg-accent px-0.5 text-[8px] font-bold leading-3 text-ink-900">
                                    {commentUnreadCount > 9 ? "9+" : commentUnreadCount}
                                </span>
                            )}
                        </IconButton>
                    )}
                    {saveStatus && (
                        <div
                            role="status"
                            aria-label={
                                saveStatus === "saving"
                                    ? t("file.saving")
                                    : saveStatus === "saved"
                                        ? t("file.saved")
                                        : t("file.saveFailed")
                            }
                            title={
                                saveStatus === "error" && saveErrorDetail
                                    ? `${t("file.saveFailed")}: ${saveErrorDetail}`
                                    : undefined
                            }
                            className={`hidden h-8 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition uilg:flex uixl:px-2.5 ${
                                saveStatus === "saving"
                                    ? "border-amber-400/15 bg-amber-400/5 text-amber-200"
                                    : saveStatus === "saved"
                                        ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-200"
                                        : "border-red-400/20 bg-red-400/10 text-red-200"
                            }`}
                        >
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                    saveStatus === "saving"
                                        ? "animate-pulse bg-amber-300"
                                        : saveStatus === "saved"
                                            ? "bg-emerald-300"
                                            : "bg-red-300"
                                }`}
                            />
                            <span className="hidden uixl:inline">
                                {saveStatus === "saving"
                                    ? t("file.saving")
                                    : saveStatus === "saved"
                                        ? t("file.saved")
                                        : t("file.saveFailed")}
                            </span>
                        </div>
                    )}
                    <Menu
                        label={t("nav.file")}
                        tone="accent"
                        items={[
                            {
                                label: t("file.newOpen"),
                                onClick: () => setModal("welcome"),
                            },
                            {
                                label:
                                    saveStatus === "saving"
                                        ? t("file.saving")
                                        : t("file.saveLocally"),
                                hint: "Ctrl+S",
                                disabled: saveStatus === "saving",
                                onClick: () => void handleSave(),
                            },
                            {
                                label:
                                    cloudSaveStatus === "saving"
                                        ? t("file.saving")
                                        : t("file.saveToCloud"),
                                title: !authUser ? t("file.logInFirst") : undefined,
                                disabled:
                                    !authUser || !canEdit || cloudSaveStatus === "saving",
                                onClick: () => void handleCloudSave(),
                            },
                            { separator: true },
                            {
                                label: t("file.exportOsu"),
                                disabled: !canExport,
                                onClick: handleExportOsu,
                            },
                            {
                                label: t("file.exportOsz"),
                                disabled: !canExport || exporting,
                                onClick: handleExportOsz,
                            },
                            {
                                label: t("file.exportSm"),
                                disabled: !canExport,
                                onClick: handleExportSm,
                            },
                            {
                                label: t("file.exportQua"),
                                disabled:
                                    !canExport ||
                                    (active.keyCount !== 4 && active.keyCount !== 7),
                                title:
                                    active.keyCount !== 4 && active.keyCount !== 7
                                        ? t("app.quaverKeys")
                                        : undefined,
                                onClick: handleExportQua,
                            },
                            {
                                label: t("file.exportMcz"),
                                disabled: !canExport || exporting || !hasMalodyDifficulty,
                                title: !hasMalodyDifficulty
                                    ? t("malody.maxKeys", { count: MALODY_MAX_KEYS })
                                    : undefined,
                                onClick: handleExportMcz,
                            },
                            { separator: true },
                            {
                                label: t("file.mapCard"),
                                onClick: () => openMapCard(),
                            },
                            {
                                label: t("file.backups"),
                                onClick: () => setModal("backups"),
                            },
                            ...(isDesktopApp()
                                ? [
                                        { separator: true as const },
                                        {
                                            label: t("file.versionHistory"),
                                            disabled: !hasProject,
                                            onClick: () => setModal("versionHistory"),
                                        },
                                        {
                                            label: t("file.editExternally"),
                                            title: t("file.editExternallyHint"),
                                            disabled: !hasProject || !canEdit,
                                            onClick: () => void beginExternalEdit(),
                                        },
                                    ]
                                : []),
                            ...(osuApp?.supported
                                ? [
                                        { separator: true as const },
                                        {
                                            label: t("file.importIntoOsu"),
                                            disabled: !canExport || osuBusy || exporting,
                                            title: !osuApp.installed
                                                ? t("osu.notInstalled")
                                                : undefined,
                                            onClick: handleSendToOsu,
                                        },
                                        {
                                            label: t("file.syncToOsu"),
                                            disabled: !canExport || osuBusy || exporting,
                                            title: t("file.syncToOsuHint"),
                                            onClick: handleSyncToOsu,
                                        },
                                        {
                                            label: t("file.importFromOsu"),
                                            disabled: osuBusy || importingMap,
                                            title: !osuApp.running
                                                ? t("osu.notRunning")
                                                : undefined,
                                            onClick: () => void handleLoadFromOsu(),
                                        },
                                    ]
                                : []),
                        ]}
                    />
                </div>
            </div>
            {liveEnabled && (
                <span
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-700/42 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur-xl"
                    title={
                        collab.status === "connected"
                            ? t("collab.live")
                            : collab.status === "connecting"
                                ? t("collab.connecting")
                                : t("collab.offline")
                    }
                >
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${
                            collab.status === "connected"
                                ? "bg-emerald-400"
                                : collab.status === "connecting"
                                    ? "animate-pulse bg-amber-400"
                                    : "bg-rose-500"
                        }`}
                    />
                    <span className="text-slate-300">{t("app.live")}</span>
                </span>
            )}
            {liveEnabled && collab.peers.length > 0 && (
                <div
                    className="flex items-center -space-x-1.5"
                    title={t("app.editingNow")}
                >
                    {collab.peers.slice(0, 5).map((p) => (
                        <span
                            key={p.id}
                            className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 bg-ink-700/70 text-[10px] font-semibold text-slate-100 shadow-sm backdrop-blur"
                            style={{ borderColor: p.color }}
                            title={p.username}
                        >
                            {p.avatar ? (
                                <img
                                    src={p.avatar}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                p.username.slice(0, 1).toUpperCase()
                            )}
                        </span>
                    ))}
                </div>
            )}
            {!hasProject && !sharedSlug && <NowPlaying
                    music={menuMusic}
                    preferOriginalMetadata={preferOriginalMetadata}
                />}
            {!hasProject && featureFlags.desktop_download && (
                <DesktopDownloadLink
                    active={showHeader && modal === null && !packCreatorOpen}
                />
            )}
            {!hasProject && <LanguagePicker compact />}
            {authUser && (
                <NotificationInbox
                    notifications={notifications}
                    loading={notificationsLoading}
                    error={notificationsError}
                    onRefresh={refreshNotifications}
                    onOpen={openInboxNotification}
                    onMarkRead={markInboxNotificationRead}
                    onMarkAllRead={markInboxAllRead}
                    onDismiss={dismissInboxNotification}
                />
            )}
            <AccountControl
                compact
                onOpenMyMaps={() => setModal("myMaps")}
                onOpenPresets={
                    appSettings.showPatternTools
                        ? () => setModal("presets")
                        : undefined
                }
                onOpenFeedback={() => setModal("feedback")}
                onOpenAdmin={() => setModal("admin")}
            />
        </div>
    </header>
  );
}
