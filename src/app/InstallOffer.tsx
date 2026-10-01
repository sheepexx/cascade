import { useEffect, useRef, useState } from "react";
import { Toast } from "../components/ui/Toast";
import { useT } from "../lib/i18n";
import {
  loadInstallRecord,
  mayOfferInstall,
  promptInstall,
  recordInstallDismissed,
  recordInstallIgnored,
  useInstallAvailable,
} from "../lib/installPrompt";

/** Time spent with a map open, no dialog in the way, before the offer. */
export const INSTALL_OFFER_AFTER_MS = 4 * 60_000;
const TICK_MS = 15_000;
let offeredThisVisit = false;

/**
 * Offers installing Cascade once a visit, after a few minutes of mapping and
 * only while the browser allows it and the mapper hasn't turned it down
 * recently. Closing it or choosing Not now counts as a no; letting it time
 * out only puts it off for a few days.
 */
export function InstallOffer({ eligible }: { eligible: boolean }) {
  const t = useT();
  const available = useInstallAvailable();
  const [open, setOpen] = useState(false);
  const engagedMs = useRef(0);
  const answered = useRef(false);
  const closed = useRef(false);

  useEffect(() => {
    if (!eligible || !available || offeredThisVisit) return;
    const timer = window.setInterval(() => {
      engagedMs.current += TICK_MS;
      if (engagedMs.current < INSTALL_OFFER_AFTER_MS || offeredThisVisit) return;
      window.clearInterval(timer);
      if (!mayOfferInstall(loadInstallRecord(), Date.now())) return;
      offeredThisVisit = true;
      setOpen(true);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [eligible, available]);

  return (
    <Toast
      open={open && available}
      tone="info"
      title={t("install.title")}
      message={t("install.body")}
      durationMs={15_000}
      resetKey="install-offer"
      actions={[
        {
          label: t("install.install"),
          primary: true,
          onClick: () => {
            answered.current = true;
            void promptInstall();
          },
        },
        {
          label: t("recovery.dismiss"),
          onClick: () => {
            answered.current = true;
            recordInstallDismissed();
          },
        },
      ]}
      onClose={() => {
        closed.current = true;
        if (!answered.current) recordInstallDismissed();
      }}
      onDismiss={() => {
        if (!closed.current) recordInstallIgnored();
        setOpen(false);
      }}
    />
  );
}
