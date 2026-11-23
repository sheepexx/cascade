import { useState } from "react";
import { useAuth, type LoginProvider } from "../../lib/auth";
import { useT, type MessageKey } from "../../lib/i18n";
import { isDesktopApp } from "../../lib/pwa";
import { Button } from "../ui/Controls";
import { Modal } from "../ui/Modal";
import { LegalLinks, ProviderButtons } from "../auth/LoginDialog";

export type AccountReason = "cloudSave" | "share";

const TITLES: Record<AccountReason, MessageKey> = {
  cloudSave: "account.titleCloudSave",
  share: "account.titleShare",
};

/**
 * What a logged-out mapper sees on reaching for something that needs an
 * account. Nothing in the editor is locked behind it: any open map is saved
 * on this device before it shows, it says so, lists what an account adds,
 * and offers the ways to log in or a way back.
 */
export function AccountPromptModal({
  open,
  reason,
  hasMap,
  collab,
  onClose,
}: {
  open: boolean;
  reason: AccountReason;
  /** A map is open and has just been saved on this device. */
  hasMap: boolean;
  /** Live sessions are switched on for this build. */
  collab: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { loginWith, loginProviders } = useAuth();
  const [busy, setBusy] = useState<LoginProvider | null>(null);
  const perks: MessageKey[] = [
    "account.perkCloud",
    ...(collab ? (["account.perkCollab"] as const) : []),
    "account.perkShare",
    "account.perkInbox",
  ];

  return (
    <Modal
      open={open}
      title={t(TITLES[reason])}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t("recovery.dismiss")}</Button>}
    >
      <p className="text-sm text-slate-300">
        {hasMap ? t("account.body") : t("account.bodyNoMap")}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm text-slate-300">
        {perks.map((perk) => (
          <li key={perk} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {t(perk)}
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <ProviderButtons
          providers={loginProviders}
          busy={busy}
          onChoose={(provider) => {
            setBusy(provider);
            // The map is saved before the page is left (App's before-login step).
            void loginWith(provider).finally(() => {
              if (isDesktopApp()) setBusy(null);
            });
          }}
        />
      </div>
      <p className="mt-4 text-[11px] text-slate-500">
        {isDesktopApp()
          ? t("account.desktopNote")
          : hasMap
            ? t("account.redirectNote")
            : null}{" "}
        <LegalLinks />
      </p>
    </Modal>
  );
}
