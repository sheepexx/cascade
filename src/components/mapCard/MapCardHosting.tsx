import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Controls";
import { HoldToDelete } from "../ui/HoldToDelete";
import { mapCardBbcode } from "../../lib/mapCard";
import { useLocale } from "../../lib/i18n";
import type { useHostedMapCard } from "../../hooks/useHostedMapCard";
import { CARD_LABEL, CardSection, Notice, Spinner } from "./controls";

function CopyField({
  label,
  value,
  button,
}: {
  label: string;
  value: string;
  button: string;
}) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setState("manual");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className={CARD_LABEL}>{label}</span>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={value}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-700/65 px-3 py-1.5 font-mono text-xs text-slate-100 shadow-inner shadow-black/10 outline-none transition duration-[var(--motion-quick)] focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
        />
        <Button
          variant={state === "copied" ? "primary" : "accent"}
          onClick={() => void copy()}
          className="shrink-0 whitespace-nowrap py-1.5"
        >
          {state === "copied" ? t("common.copied") : button}
        </Button>
      </div>
      {state === "manual" && (
        <span className="text-[11px] text-amber-200">{t("mapCard.copyBlocked")}</span>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return date.toLocaleString();
  }
}

export function MapCardHosting({
  hosted,
  signedIn,
  authLoading,
  ready,
  stale,
  onLogin,
  onUpload,
}: {
  hosted: ReturnType<typeof useHostedMapCard>;
  signedIn: boolean;
  authLoading: boolean;
  ready: boolean;
  stale: boolean;
  onLogin: () => void;
  onUpload: () => void;
}) {
  const { t, locale } = useLocale();
  const { card, status, error } = hosted;
  const uploading = status === "uploading";
  const deleting = status === "deleting";

  return (
    <CardSection
      title={t("mapCard.hostedImage")}
      aside={
        card ? (
          <span className="text-[11px] tabular-nums text-slate-500">
            {t("mapCard.version", { version: card.version })}
          </span>
        ) : null
      }
    >
      {authLoading ? (
        <p className="flex items-center gap-2 text-[12px] text-slate-400">
          <Spinner />
          {t("mapCard.checkingAccount")}
        </p>
      ) : !signedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-slate-400">
            {t("mapCard.hostSignedOut")}
          </p>
          <Button variant="accent" onClick={onLogin} className="shrink-0">
            {t("mapCard.signInOsu")}
          </Button>
        </div>
      ) : status === "checking" ? (
        <p className="flex items-center gap-2 text-[12px] text-slate-400">
          <Spinner />
          {t("mapCard.lookingForHosted")}
        </p>
      ) : card ? (
        <>
          <CopyField
            label={t("mapCard.imageUrl")}
            value={card.url}
            button={t("mapCard.copyUrl")}
          />
          <CopyField
            label={t("mapCard.bbcode")}
            value={mapCardBbcode(card.url)}
            button={t("mapCard.copyBbcode")}
          />
          <p className="text-[11px] tabular-nums text-slate-500">
            {t("mapCard.hostedMeta", {
              when: formatWhen(card.updatedAt, locale),
              width: String(card.width),
              height: String(card.height),
              size: formatBytes(card.bytes),
            })}
          </p>
          {stale && <Notice tone="warn">{t("mapCard.stale")}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={stale ? "accent" : "primary"}
              onClick={onUpload}
              disabled={!ready || uploading || deleting}
              className="flex items-center gap-2"
            >
              {uploading && <Spinner />}
              {uploading ? t("mapCard.updating") : t("mapCard.updateHosted")}
            </Button>
            <HoldToDelete
              onConfirm={() => void hosted.remove()}
              disabled={uploading || deleting}
              title={t("mapCard.holdToRemoveTitle")}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/10 hover:text-red-300 disabled:opacity-40"
            >
              {deleting ? t("mapCard.removing") : t("mapCard.holdToRemove")}
            </HoldToDelete>
          </div>
          <p className="text-[11px] leading-snug text-slate-500">{t("mapCard.keepsLink")}</p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] leading-snug text-slate-400">{t("mapCard.uploadIntro")}</p>
          <Button
            variant="accent"
            onClick={onUpload}
            disabled={!ready || uploading}
            className="flex items-center justify-center gap-2 self-start"
          >
            {uploading && <Spinner className="border-white/40 border-t-white" />}
            {uploading ? t("mapCard.uploading") : t("mapCard.upload")}
          </Button>
        </div>
      )}

      {error && (
        <Notice tone="error">
          <span className="min-w-0 flex-1">{error}</span>
          {hosted.lookupFailed && (
            <button
              type="button"
              onClick={hosted.retry}
              className="shrink-0 font-medium text-red-100 underline-offset-2 hover:underline"
            >
              {t("common.retry")}
            </button>
          )}
        </Notice>
      )}
    </CardSection>
  );
}
