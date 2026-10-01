import { useState } from "react";
import { useT, type MessageKey } from "../../lib/i18n";
import { isDesktopApp } from "../../lib/pwa";
import { siteUrl } from "../../lib/siteAssets";
import { Button } from "../ui/Controls";
import { Modal } from "../ui/Modal";

export type AccountReason = "cloudSave" | "share";

const TITLES: Record<AccountReason, MessageKey> = {
  cloudSave: "account.titleCloudSave",
  share: "account.titleShare",
};

/**
 * What a logged-out mapper sees on reaching for something that needs an
 * account. Nothing in the editor is locked behind it: any open map is saved
 * on this device before it shows, it says so, lists what an account adds,
 * and offers the osu! login or a way back.
 */
export function AccountPromptModal({
  open,
  reason,
  hasMap,
  collab,
  onClose,
  onLogin,
}: {
  open: boolean;
  reason: AccountReason;
  /** A map is open and has just been saved on this device. */
  hasMap: boolean;
  /** Live sessions are switched on for this build. */
  collab: boolean;
  onClose: () => void;
  /** Saves locally, then starts the login. */
  onLogin: () => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
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
      footer={
        <>
          <Button onClick={onClose}>{t("recovery.dismiss")}</Button>
          <Button
            variant="accent"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onLogin().finally(() => setBusy(false));
            }}
          >
            {t("startModal.loginWithOsu")}
          </Button>
        </>
      }
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
      <p className="mt-4 text-[11px] text-slate-500">
        {isDesktopApp()
          ? t("account.desktopNote")
          : hasMap
            ? t("account.redirectNote")
            : null}{" "}
        <a
          href={siteUrl("terms")}
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap underline decoration-ink-500 underline-offset-2 transition hover:text-slate-300"
        >
          {t("settings.terms")}
        </a>{" "}
        <a
          href={siteUrl("privacy")}
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap underline decoration-ink-500 underline-offset-2 transition hover:text-slate-300"
        >
          {t("startModal.privacyPolicy")}
        </a>
      </p>
    </Modal>
  );
}
