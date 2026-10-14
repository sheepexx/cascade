import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useT, type MessageKey } from "../../lib/i18n";
import { clearMappingActivity } from "../../lib/mappingStatsApi";
import {
  DEFAULT_PRIVACY,
  getMyPrivacy,
  setMyPrivacy,
  type PrivacyLevel,
  type PrivacySettings,
} from "../../lib/social";
import { Button } from "../ui/Controls";
import { Dropdown } from "../ui/Dropdown";
import { HoldConfirmDialog } from "../ui/HoldConfirmDialog";
import { Skeleton } from "../ui/Skeleton";
import { SettingRow, SettingsExtra, SettingsSection } from "./settingsLayout";

type Row = {
  key: keyof PrivacySettings;
  label: MessageKey;
  hint: MessageKey;
  levels: readonly PrivacyLevel[];
};

const CONTACT: Row[] = [
  { key: "friend_requests", label: "privacy.friendRequests", hint: "privacy.friendRequestsHint", levels: ["everyone", "nobody"] },
  { key: "messages", label: "privacy.messages", hint: "privacy.messagesHint", levels: ["everyone", "friends", "nobody"] },
];

const VISIBILITY: Row[] = [
  { key: "online_status", label: "privacy.onlineStatus", hint: "privacy.onlineStatusHint", levels: ["everyone", "friends", "nobody"] },
  { key: "activity", label: "privacy.activity", hint: "privacy.activityHint", levels: ["everyone", "friends", "nobody"] },
  { key: "mapping_stats", label: "privacy.mappingStats", hint: "privacy.mappingStatsHint", levels: ["everyone", "friends", "nobody"] },
  { key: "mapping_time", label: "privacy.mappingTime", hint: "privacy.mappingTimeHint", levels: ["everyone", "friends", "nobody"] },
  { key: "project_time", label: "privacy.projectTime", hint: "privacy.projectTimeHint", levels: ["everyone", "friends", "nobody"] },
  { key: "projects", label: "privacy.projects", hint: "privacy.projectsHint", levels: ["everyone", "friends", "nobody"] },
];

const LEVEL_LABELS: Record<PrivacyLevel, MessageKey> = {
  everyone: "privacy.everyone",
  friends: "privacy.friendsOnly",
  nobody: "privacy.onlyMe",
};

/**
 * Social & privacy settings. Each choice saves at once and is enforced by the
 * database for every request, not only by what the app shows.
 */
export function SocialPrivacySettings({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const t = useT();
  const { user, login } = useAuth();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyPrivacy()
      .then((loaded) => {
        if (!cancelled) setSettings({ ...DEFAULT_PRIVACY, ...loaded });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("privacy.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [user, t]);

  if (!user) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-slate-300">{t("privacy.signedOut")}</p>
        <Button variant="accent" onClick={login}>{t("startModal.loginWithOsu")}</Button>
      </div>
    );
  }

  const update = (key: keyof PrivacySettings, value: PrivacyLevel) => {
    if (!settings) return;
    const before = settings;
    const next = { ...settings, [key]: value } as PrivacySettings;
    setSettings(next);
    setSaving(true);
    setError(null);
    setMyPrivacy({ [key]: value } as Partial<PrivacySettings>)
      .then((saved) => setSettings({ ...DEFAULT_PRIVACY, ...saved }))
      .catch((e: unknown) => {
        setSettings(before);
        setError(e instanceof Error ? e.message : t("privacy.saveFailed"));
      })
      .finally(() => setSaving(false));
  };

  const rows = (list: Row[]) =>
    list.map((row) => (
      <SettingRow key={row.key} label={t(row.label)} tip={t(row.hint)}>
        {settings ? (
          <Dropdown<PrivacyLevel>
            size="sm"
            className="w-36 shrink-0"
            aria-label={t(row.label)}
            value={settings[row.key] as PrivacyLevel}
            onChange={(value) => update(row.key, value)}
            options={row.levels.map((level) => ({ value: level, label: t(LEVEL_LABELS[level]) }))}
          />
        ) : (
          <Skeleton className="h-7 w-36 rounded-md" />
        )}
      </SettingRow>
    ));

  return (
    <div className="flex flex-col">
      <SettingsExtra className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-xs leading-relaxed text-slate-400">{t("privacy.intro")}</p>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-slate-500">{t("file.saving")}</span>}
          {onOpenProfile && (
            <Button variant="primary" size="sm" onClick={onOpenProfile}>
              {t("privacy.viewProfile")}
            </Button>
          )}
        </div>
      </SettingsExtra>
      {error && <p role="alert" className="mb-4 text-sm text-rose-300">{error}</p>}
      <SettingsSection title={t("privacy.whoCanContact")}>{rows(CONTACT)}</SettingsSection>
      <SettingsSection title={t("privacy.whoCanSee")}>
        {rows(VISIBILITY)}
        <SettingsExtra>
          <p className="py-2.5 text-xs leading-relaxed text-slate-500">{t("privacy.hideStatusNote")}</p>
        </SettingsExtra>
      </SettingsSection>
      <SettingsSection title={t("privacy.mappingTimeTitle")} description={t("privacy.mappingTimeExplainer")}>
        <SettingRow label={t("privacy.clearStats")} tip={t("privacy.clearStatsHint")}>
          <Button variant="primary" size="sm" disabled={cleared} onClick={() => setClearOpen(true)}>
            {cleared ? t("privacy.cleared") : t("privacy.clear")}
          </Button>
        </SettingRow>
      </SettingsSection>
      <HoldConfirmDialog
        open={clearOpen}
        title={t("privacy.clearConfirmTitle")}
        message={t("privacy.clearConfirmMessage")}
        confirmLabel={t("privacy.clear")}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          setClearOpen(false);
          void clearMappingActivity(null)
            .then(() => setCleared(true))
            .catch((e: unknown) => setError(e instanceof Error ? e.message : t("privacy.saveFailed")));
        }}
      />
    </div>
  );
}
