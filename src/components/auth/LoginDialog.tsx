import { useEffect, useState } from "react";
import { useAuth, type LoginProvider } from "../../lib/auth";
import { LOGIN_PROVIDERS, PROVIDER_NAMES, authErrorText } from "../../lib/accountLinks";
import { useT } from "../../lib/i18n";
import { isDesktopApp } from "../../lib/pwa";
import { siteAsset, siteUrl } from "../../lib/siteAssets";
import { Button } from "../ui/Controls";
import { DiscordIcon } from "../ui/Icons";
import { Modal } from "../ui/Modal";

/** The provider's own mark, in its own colour: brand marks are never restyled. */
export function ProviderMark({ provider, className = "h-[18px] w-[18px]" }: { provider: LoginProvider; className?: string }) {
  if (provider === "discord") return <DiscordIcon className={`${className} shrink-0 text-[#5865F2]`} />;
  return <img src={siteAsset("osu-logo.png")} alt="" aria-hidden draggable={false} className={`${className} shrink-0`} />;
}

/**
 * "Continue with Discord" and "Continue with osu!", for the login dialog and
 * the account prompt. Equal choices, so neither is the accent.
 */
export function ProviderButtons({
  providers,
  busy,
  onChoose,
}: {
  providers: LoginProvider[];
  /** The provider being opened; every button waits meanwhile. */
  busy: LoginProvider | null;
  onChoose: (provider: LoginProvider) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      {LOGIN_PROVIDERS.filter((p) => providers.includes(p)).map((provider) => (
        <Button
          key={provider}
          variant="primary"
          className="h-10 w-full gap-2.5 text-sm"
          disabled={busy !== null}
          aria-busy={busy === provider}
          onClick={() => onChoose(provider)}
        >
          <ProviderMark provider={provider} />
          {busy === provider
            ? t("auth.opening", { provider: PROVIDER_NAMES[provider] })
            : t("auth.continueWith", { provider: PROVIDER_NAMES[provider] })}
        </Button>
      ))}
    </div>
  );
}

export function LegalLinks() {
  const t = useT();
  const link =
    "whitespace-nowrap underline decoration-ink-500 underline-offset-2 transition hover:text-slate-300";
  return (
    <>
      <a href={siteUrl("terms")} target="_blank" rel="noreferrer" className={link}>
        {t("settings.terms")}
      </a>{" "}
      <a href={siteUrl("privacy")} target="_blank" rel="noreferrer" className={link}>
        {t("startModal.privacyPolicy")}
      </a>
    </>
  );
}

/**
 * The one place a signed-out person chooses how to log in. Every "Log in"
 * button in Cascade opens it. Either provider makes a new account or signs in
 * to an existing one; connecting the other one later happens in Settings.
 */
export function LoginDialog() {
  const t = useT();
  const { loginOpen, closeLogin, loginWith, loginProviders, waiting, cancelWaiting, notice, user } = useAuth();
  const [opening, setOpening] = useState<LoginProvider | null>(null);
  const error = notice?.kind === "error" && notice.context === "login" ? notice : null;

  // A page that comes back (the browser's back button) must not stay stuck.
  useEffect(() => {
    if (!loginOpen) setOpening(null);
    const reset = () => setOpening(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, [loginOpen]);

  useEffect(() => {
    if (user && loginOpen) closeLogin();
  }, [user, loginOpen, closeLogin]);

  const choose = (provider: LoginProvider) => {
    setOpening(provider);
    void loginWith(provider).finally(() => {
      // The web leaves the page; the desktop app waits on the browser instead.
      if (isDesktopApp()) setOpening(null);
    });
  };

  return (
    <Modal open={loginOpen} title={t("auth.dialogTitle")} onClose={closeLogin} width="max-w-sm">
      <p className="text-sm text-slate-300">{t("auth.dialogBody")}</p>
      <div className="mt-4">
        {waiting ? (
          <div className="flex flex-col gap-3" role="status">
            <p className="flex items-start gap-2.5 text-sm text-slate-200">
              <ProviderMark provider={waiting} className="mt-px h-[18px] w-[18px]" />
              {t("auth.waitingBrowser", { provider: PROVIDER_NAMES[waiting] })}
            </p>
            <Button className="self-start" onClick={cancelWaiting}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <ProviderButtons providers={loginProviders} busy={opening} onChoose={choose} />
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {authErrorText(t, error.reason, error.provider)}
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-slate-400">{t("auth.newHere")}</p>
      <p className="mt-2 text-[11px] text-slate-500">
        <LegalLinks />
      </p>
    </Modal>
  );
}
