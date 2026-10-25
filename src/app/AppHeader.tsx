import type { Dispatch, SetStateAction } from "react";
import { AccountControl, type SocialMenuTarget } from "../components/auth/LoginButton";
import { DesktopDownloadLink } from "../components/DesktopDownloadLink";
import {
  HEADER_BADGE,
  HEADER_ICON_BUTTON,
  IconButton,
  MenuButton,
} from "../components/header/HeaderButtons";
import { LanguagePicker } from "../components/LanguagePicker";
import type { AccountReason } from "../components/menus/AccountPromptModal";
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
import { PhoneIcon } from "../components/mobile/PhoneIcon";
import { PhoneMenu } from "../components/mobile/PhoneMenu";
import type { PaletteCommand } from "../components/ui/CommandPalette";

/**
 * The bar along the top of the editor: the File and More menus, undo, redo and
 * history, the save badge, live session status, the notification inbox and the
 * account button. Zen mode and playtests hide it.
 */
export function AppHeader({
  phone,
  active,
  appSettings,
  askToLogIn,
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
  handleExportBackground,
  handleExportMcz,
  handleExportOsu,
  handleExportOsz,
  handleExportQua,
  handleExportSm,
  handleLoadFromOsu,
  handleSave,
  handleSendToOsu,
  handleSyncToOsu,
  hasBackground,
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
  markInboxNotificationUnread,
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
  social,
  undo,
}: {
  phone?: { title: string; menuOpen: boolean; onMenuOpen: (open: boolean) => void; openDifficulties: () => void; commands: PaletteCommand[] };
  active: Difficulty;
  appSettings: AppSettings;
  askToLogIn: (reason: AccountReason) => void;
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
  handleExportBackground: () => void;
  handleExportMcz: () => void;
  handleExportOsu: () => void;
  handleExportOsz: () => void;
  handleExportQua: () => void;
  handleExportSm: () => void;
  handleLoadFromOsu: () => Promise<void>;
  handleSave: (silent?: boolean) => Promise<void>;
  handleSendToOsu: () => void;
  handleSyncToOsu: () => void;
  /** The active difficulty has a background to export. */
  hasBackground: boolean;
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
  markInboxNotificationUnread: (id: string) => void;
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
  /** Friends and messages, when the social features are on. */
  social: {
    unreadMessages: number;
    pendingRequests: number;
    open: (target: SocialMenuTarget) => void;
  } | null;
  undo: () => void;
}) {
  const t = useT();
  if (phone) return <>
    {showHeader && <header className={`phone-app-header z-30 flex shrink-0 items-center gap-1 border-b border-white/[0.06] bg-ink-900 px-2 ${!hasProject ? "absolute inset-x-0 top-0" : ""}`}>
      <button type="button" className="phone-icon-button" aria-label={hasProject ? t("diffSidebar.title") : t("home.returnTitle")} onClick={hasProject ? phone.openDifficulties : undefined}>
        {hasProject ? <PhoneIcon name="layers" /> : <img src={`${import.meta.env.BASE_URL}favicon.png?v=4`} alt="Cascade" className="h-7 w-7 rounded-full" />}
      </button>
      <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => phone.onMenuOpen(true)} aria-label={t("mobile.allTools")}>
        <span className="block truncate font-display text-sm font-semibold text-slate-100">{phone.title}</span>
        <span className="block truncate text-xs text-slate-400">{hasProject ? `${active.name} · ${active.keyCount}K${!canEdit ? ` · ${t("nav.viewOnly")}` : ""}` : "VSRG Editor"}</span>
      </button>
      {hasProject && saveStatus && <button type="button" className="phone-save-status flex h-11 items-center gap-1 px-1 text-xs" onClick={() => void handleSave()} aria-label={saveStatus === "error" ? t("file.saveFailed") : t("file.saveLocally")}>
        <span className={`h-1.5 w-1.5 rounded-full ${saveStatus === "error" ? "bg-rose-400" : saveStatus === "saving" ? "animate-pulse bg-amber-300" : "bg-emerald-400"}`} /><span>{saveStatus === "saving" ? t("file.saving") : saveStatus === "saved" ? t("file.saved") : t("file.saveFailed")}</span>
      </button>}
      <button type="button" className="phone-icon-button" aria-label={t("mobile.allTools")} onClick={() => phone.onMenuOpen(true)}><PhoneIcon name="more" /></button>
    </header>}
    <PhoneMenu open={phone.menuOpen} onClose={() => phone.onMenuOpen(false)} commands={phone.commands}>
      <LanguagePicker compact />
      {social && authUser && <SocialButton unreadMessages={social.unreadMessages} pendingRequests={social.pendingRequests} onOpen={target => { phone.onMenuOpen(false); social.open(target); }} />}
      <NotificationInbox signedIn={!!authUser} notifications={notifications} loading={notificationsLoading} error={notificationsError} onRefresh={refreshNotifications} onOpen={n => { phone.onMenuOpen(false); openInboxNotification(n); }} onMarkRead={markInboxNotificationRead} onMarkUnread={markInboxNotificationUnread} onMarkAllRead={markInboxAllRead} onDismiss={dismissInboxNotification} />
      <AccountControl compact onOpenFeedback={() => { phone.onMenuOpen(false); setModal("feedback"); }} onOpenAdmin={() => { phone.onMenuOpen(false); setModal("admin"); }} onOpenSocial={social ? target => { phone.onMenuOpen(false); social.open(target); } : undefined} socialBadges={social ? { friends: social.pendingRequests, messages: social.unreadMessages } : undefined} />
    </PhoneMenu>
  </>;
  const fileMenu = (
    <Menu
      label={t("nav.file")}
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
          title:
            !authUser && !featureFlags.cloud_accounts
              ? t("file.logInFirst")
              : undefined,
          disabled:
            !canEdit ||
            cloudSaveStatus === "saving" ||
            (!authUser && !featureFlags.cloud_accounts),
          onClick: () =>
            authUser ? void handleCloudSave() : askToLogIn("cloudSave"),
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
        {
          label: t("file.exportBackground"),
          disabled: !hasBackground,
          title: hasBackground ? undefined : t("file.exportBackgroundNone"),
          onClick: handleExportBackground,
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
  );
  return (
    <header
      // Solid chrome on a hairline, in the editor and over the main menu alike.
      className={`app-header z-30 flex items-center justify-between gap-2 overflow-hidden border-white/[0.06] bg-ink-900 px-2 transition-[max-height,padding,opacity,transform] duration-300 ease-out uixl:gap-3 uixl:px-3 ${
        hasProject ? "" : "absolute inset-x-0 top-0"
      } ${
        showHeader
          ? "max-h-14 translate-y-0 border-b py-2.5 opacity-100"
          : "pointer-events-none max-h-0 -translate-y-full border-b-0 py-0 opacity-0"
      }`}
      aria-hidden={!showHeader}
      {...({ inert: !showHeader ? "" : undefined } as { inert?: string })}
    >
      <div className="flex min-w-0 items-center gap-1 uixl:gap-2">
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => hasProject && setShowHomeConfirm(true)}
            className={`flex h-8 items-center gap-2 rounded-md pl-1 pr-2 transition ${
              hasProject ? "hover:bg-white/[0.07]" : ""
            }`}
            title={hasProject ? t("home.returnTitle") : undefined}
            data-no-uisound=""
          >
            <img
              src={`${import.meta.env.BASE_URL}favicon.png?v=4`}
              alt="Cascade"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="h-6 w-6 select-none rounded-full object-cover"
            />
            <span className="hidden font-display text-[0.9375rem] font-bold text-slate-50 uimd:inline">
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
          <nav className="flex items-center gap-0.5 whitespace-nowrap">
            <span className="mx-1 h-4 w-px bg-white/[0.08]" />
            {fileMenu}
            <MenuButton active={modal === "mapSettings"} onClick={() => setModal("mapSettings")}>
              {t("nav.mapSettings")}
            </MenuButton>
            <MenuButton active={modal === "timing"} onClick={() => setModal("timing")}>
              {t("nav.timing")}
            </MenuButton>
            {featureFlags.sv_tools && (
              <MenuButton active={modal === "sv"} onClick={() => setModal("sv")}>
                {t("nav.sv")}
              </MenuButton>
            )}
            <MenuButton active={modal === "difficulty"} onClick={() => setModal("difficulty")}>
              {t("nav.difficulty")}
            </MenuButton>
            <div className="hidden items-center gap-0.5 uixl:flex">
              <MenuButton active={modal === "tools"} onClick={() => setModal("tools")}>
                {t("nav.tools")}
              </MenuButton>
              <MenuButton active={modal === "aimod"} onClick={openAiMod}>
                {t("nav.aiMod")}
              </MenuButton>
              {appSettings.showPatternTools && (
                <MenuButton active={modal === "presets"} onClick={() => setModal("presets")}>
                  {t("nav.presets")}
                </MenuButton>
              )}
              <MenuButton active={modal === "skin"} onClick={() => setModal("skin")}>
                {t("nav.skin")}
              </MenuButton>
              <MenuButton active={modal === "settings"} onClick={() => openSettings()}>
                {t("nav.settings")}
              </MenuButton>
              <span className="mx-1 h-4 w-px bg-white/[0.08]" />
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

      <div className="flex shrink-0 items-center gap-1 uixl:gap-1.5">
        <div
          className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
            hasProject
              ? "max-w-[68rem] translate-x-0 opacity-100"
              : "pointer-events-none max-w-0 translate-x-3 opacity-0"
          }`}
          aria-hidden={!hasProject}
        >
          <div className="flex items-center gap-1 whitespace-nowrap">
            {cloudProjectId && myRole === "viewer" && (
              <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-2xs font-medium text-amber-300">
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
                  <span className={HEADER_BADGE}>
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
                // Status as text beside a dot: present, never a badge.
                className={`hidden h-8 items-center gap-1.5 px-2 text-xs transition uilg:flex ${
                  saveStatus === "error" ? "text-rose-300" : "text-slate-400"
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
          </div>
        </div>
        {liveEnabled && (
          <span
            className="flex h-8 items-center gap-1.5 px-2 text-xs"
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
            <span className="text-slate-400">{t("app.live")}</span>
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
                className="grid h-6 w-6 place-items-center overflow-hidden rounded-full border-2 bg-ink-600 text-[10px] font-semibold text-slate-100"
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
        {social && authUser && (
          <SocialButton
            unreadMessages={social.unreadMessages}
            pendingRequests={social.pendingRequests}
            onOpen={social.open}
          />
        )}
        <NotificationInbox
          signedIn={!!authUser}
          notifications={notifications}
          loading={notificationsLoading}
          error={notificationsError}
          onRefresh={refreshNotifications}
          onOpen={openInboxNotification}
          onMarkRead={markInboxNotificationRead}
          onMarkUnread={markInboxNotificationUnread}
          onMarkAllRead={markInboxAllRead}
          onDismiss={dismissInboxNotification}
        />
        <AccountControl
          compact
          onOpenFeedback={() => setModal("feedback")}
          onOpenAdmin={() => setModal("admin")}
          onOpenSocial={social?.open}
          socialBadges={
            social
              ? { friends: social.pendingRequests, messages: social.unreadMessages }
              : undefined
          }
        />
      </div>
    </header>
  );
}

/**
 * Friends and messages from the header, next to the inbox. The badge counts
 * unread messages and friend requests waiting for an answer; a click goes to
 * whichever needs attention.
 */
function SocialButton({
  unreadMessages,
  pendingRequests,
  onOpen,
}: {
  unreadMessages: number;
  pendingRequests: number;
  onOpen: (target: SocialMenuTarget) => void;
}) {
  const t = useT();
  const total = unreadMessages + pendingRequests;
  const label =
    total > 0
      ? t("social.headerButtonUnread", { count: total })
      : t("social.headerButton");
  return (
    <button
      type="button"
      onClick={() => onOpen(unreadMessages > 0 ? "messages" : "friends")}
      aria-label={label}
      title={label}
      className={HEADER_ICON_BUTTON}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className="h-[18px] w-[18px]">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.5 18.5 4 20.5V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3H7.5ZM8 9.5h8M8 13h5"
        />
      </svg>
      {total > 0 && (
        <span className={HEADER_BADGE}>
          {total > 99 ? "99+" : total}
        </span>
      )}
    </button>
  );
}
