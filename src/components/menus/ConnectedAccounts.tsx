import { useEffect, useState } from "react";
import { sessionToken, useAuth, type AuthNotice, type LoginProvider } from "../../lib/auth";
import {
  authErrorText,
  fetchIdentities,
  LOGIN_PROVIDERS,
  PROVIDER_NAMES,
  type Identities,
  type Identity,
} from "../../lib/accountLinks";
import { useT } from "../../lib/i18n";
import { getMyPrivacy, setMyPrivacy, type PrivacySettings } from "../../lib/social";
import { Button, Toggle } from "../ui/Controls";
import { Modal } from "../ui/Modal";
import { Skeleton } from "../ui/Skeleton";
import { ProviderMark } from "../auth/LoginDialog";
import { SettingRow, SettingsExtra, SettingsSection } from "./settingsLayout";

/**
 * Settings, Account: the ways this Cascade account signs in, and what the
 * Discord bot may show. Adding or removing one asks for a fresh sign-in when
 * the session is old, and the last way in can never be removed.
 */
export function ConnectedAccounts() {
  const t = useT();
  const { user, login, loginProviders, notice, clearNotice, connect, disconnect, confirmIdentity } = useAuth();
  const [state, setState] = useState<Identities | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<LoginProvider | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<LoginProvider | null>(null);
  const providerKey = user?.providers?.join(",") ?? "";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadFailed(false);
    fetchIdentities(sessionToken())
      .then((loaded) => {
        if (!cancelled) setState(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, providerKey]);

  if (!user) {
    return (
      <SettingsSection title={t("connections.title")}>
        <SettingsExtra className="flex flex-col items-start gap-3 py-2">
          <p className="text-sm text-slate-300">{t("connections.signedOut")}</p>
          <Button variant="accent" onClick={login}>
            {t("auth.logIn")}
          </Button>
        </SettingsExtra>
      </SettingsSection>
    );
  }

  const identities = state?.identities ?? [];
  const available = state?.available ?? loginProviders;
  const accountNotice = notice?.context === "account" ? notice : null;
  const run = (provider: LoginProvider, work: () => Promise<void>) => {
    setBusy(provider);
    void work().finally(() => setBusy(null));
  };
  const other = (provider: LoginProvider) => identities.find((i) => i.provider !== provider)?.provider ?? null;

  return (
    <>
      <SettingsSection title={t("connections.title")}>
        <SettingsExtra className="pb-3">
          <p className="max-w-xl text-xs leading-relaxed text-slate-400">{t("connections.intro")}</p>
        </SettingsExtra>
        {accountNotice && (
          <SettingsExtra className="pb-3">
            <NoticeBlock notice={accountNotice} onConfirm={() => void confirmIdentity()} onDismiss={clearNotice} />
          </SettingsExtra>
        )}
        {loadFailed && !state ? (
          <SettingsExtra className="py-2">
            <p role="alert" className="text-sm text-rose-300">
              {t("connections.loadFailed")}
            </p>
          </SettingsExtra>
        ) : (
          LOGIN_PROVIDERS.map((provider) => (
            <ProviderRow
              key={provider}
              provider={provider}
              identity={identities.find((i) => i.provider === provider) ?? null}
              loading={!state}
              only={identities.length <= 1}
              available={available.includes(provider)}
              busy={busy}
              onConnect={() => run(provider, () => connect(provider))}
              onDisconnect={() => setConfirmRemove(provider)}
            />
          ))
        )}
      </SettingsSection>

      {available.includes("discord") && <DiscordBotSettings hasDiscord={identities.some((i) => i.provider === "discord")} />}

      <Modal
        open={confirmRemove !== null}
        title={t("connections.disconnectTitle", { provider: PROVIDER_NAMES[confirmRemove ?? "discord"] })}
        onClose={() => setConfirmRemove(null)}
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setConfirmRemove(null)}>{t("common.cancel")}</Button>
            <Button
              variant="danger"
              onClick={() => {
                const provider = confirmRemove;
                setConfirmRemove(null);
                if (provider) run(provider, () => disconnect(provider));
              }}
            >
              {t("connections.disconnect")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          {t("connections.disconnectBody", {
            other: PROVIDER_NAMES[(confirmRemove && other(confirmRemove)) ?? "osu"],
          })}
        </p>
      </Modal>
    </>
  );
}

function ProviderRow({
  provider,
  identity,
  loading,
  only,
  available,
  busy,
  onConnect,
  onDisconnect,
}: {
  provider: LoginProvider;
  identity: Identity | null;
  loading: boolean;
  only: boolean;
  available: boolean;
  busy: LoginProvider | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const t = useT();
  const name = PROVIDER_NAMES[provider];
  return (
    <div data-setting className="settings-row flex min-h-[3.5rem] items-center gap-3 py-2">
      {identity?.avatar_url ? (
        <img
          src={identity.avatar_url}
          alt=""
          draggable={false}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.05]">
          <ProviderMark provider={provider} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
          {identity?.avatar_url && <ProviderMark provider={provider} className="h-3.5 w-3.5" />}
          {name}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
          {loading ? (
            <Skeleton className="h-3 w-28 rounded" />
          ) : (
            <>
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${identity ? "bg-emerald-400" : "bg-slate-600"}`}
              />
              <span className="truncate">
                {identity
                  ? t("connections.connectedAs", { name: identity.display_name ?? name })
                  : available
                    ? t("connections.notConnected")
                    : t("connections.unavailable")}
              </span>
            </>
          )}
        </div>
      </div>
      {!loading &&
        (identity ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={only || busy !== null}
            title={only ? t("connections.onlyOne") : undefined}
            aria-label={`${t("connections.disconnect")} ${name}`}
            onClick={onDisconnect}
          >
            {t("connections.disconnect")}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={!available || busy !== null}
            aria-busy={busy === provider}
            aria-label={`${t("connections.connect")} ${name}`}
            onClick={onConnect}
          >
            {t("connections.connect")}
          </Button>
        ))}
    </div>
  );
}

function NoticeBlock({
  notice,
  onConfirm,
  onDismiss,
}: {
  notice: AuthNotice;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const name = notice.provider ? PROVIDER_NAMES[notice.provider] : "";

  if (notice.kind === "reauth") {
    return (
      <div role="alert" className="flex flex-col gap-2 border-l-2 border-accent pl-3">
        <p className="text-sm font-medium text-slate-100">{t("connections.confirmTitle")}</p>
        <p className="text-xs leading-relaxed text-slate-400">
          {notice.via
            ? t(notice.action === "link" ? "connections.confirmLink" : "connections.confirmUnlink", {
                provider: name,
                via: PROVIDER_NAMES[notice.via],
              })
            : t("connections.confirmNone")}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {notice.via && (
            <Button variant="accent" size="sm" onClick={onConfirm}>
              <ProviderMark provider={notice.via} className="h-3.5 w-3.5" />
              {t("auth.continueWith", { provider: PROVIDER_NAMES[notice.via] })}
            </Button>
          )}
          <Button size="sm" onClick={onDismiss}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (notice.kind === "claimed") {
    return (
      <div role="alert" className="flex flex-col gap-1 border-l-2 border-rose-400/70 pl-3">
        <p className="text-sm font-medium text-rose-200">{t("connections.claimedTitle")}</p>
        <p className="max-w-xl text-xs leading-relaxed text-slate-400">{t("connections.claimedBody", { provider: name })}</p>
      </div>
    );
  }

  const ok = notice.kind === "linked" || notice.kind === "already_linked" || notice.kind === "unlinked";
  const text =
    notice.kind === "error"
      ? authErrorText(t, notice.reason, notice.provider)
      : notice.kind === "linked"
        ? t("connections.linked", { provider: name })
        : notice.kind === "already_linked"
          ? t("connections.alreadyLinked", { provider: name })
          : notice.kind === "unlinked"
            ? t("connections.unlinked", { provider: name })
            : notice.kind === "provider_taken"
              ? t("connections.providerTaken", { provider: name })
              : notice.kind === "wrong_account"
                ? t("connections.wrongAccount")
                : notice.kind === "last_identity"
                  ? t("connections.lastIdentity", { provider: name })
                  : t("connections.failed", { provider: name });
  return (
    <p role={ok ? "status" : "alert"} className={`flex items-center gap-2 text-sm ${ok ? "text-slate-200" : "text-rose-300"}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`} />
      {text}
    </p>
  );
}

type BotKey = "discord_lookup" | "leaderboard";

/** What the Cascade Discord bot may show, both off until turned on. */
function DiscordBotSettings({ hasDiscord }: { hasDiscord: boolean }) {
  const t = useT();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyPrivacy()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // A database without migration 0048 has no bot settings to show.
  if (settings && settings.leaderboard === undefined) return null;

  const update = (key: BotKey, on: boolean) => {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, [key]: on ? "everyone" : "nobody" });
    setError(null);
    setMyPrivacy({ [key]: on ? "everyone" : "nobody" })
      .then(setSettings)
      .catch(() => {
        setSettings(before);
        setError(t("connections.saveFailed"));
      });
  };

  const row = (key: BotKey, label: string, tip: string, disabled: boolean) => (
    <SettingRow label={label} tip={tip} disabled={disabled}>
      {settings ? (
        <Toggle
          checked={settings[key] === "everyone"}
          disabled={disabled}
          onChange={(on) => update(key, on)}
          aria-label={label}
        />
      ) : (
        <Skeleton className="h-[18px] w-8 rounded-full" />
      )}
    </SettingRow>
  );

  return (
    <SettingsSection title={t("connections.botTitle")}>
      {!hasDiscord && (
        <SettingsExtra className="pb-1">
          <p className="text-xs text-slate-400">{t("connections.botNeedsDiscord")}</p>
        </SettingsExtra>
      )}
      {row("discord_lookup", t("connections.botLookup"), t("connections.botLookupHint"), !hasDiscord)}
      {row("leaderboard", t("connections.botLeaderboard"), t("connections.botLeaderboardHint"), false)}
      {error && (
        <SettingsExtra className="pt-1">
          <p role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        </SettingsExtra>
      )}
    </SettingsSection>
  );
}
