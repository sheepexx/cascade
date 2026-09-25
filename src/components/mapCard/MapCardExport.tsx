import type { ReactNode } from "react";
import { Button } from "../ui/Controls";
import { CopyIcon, DownloadIcon } from "../ui/Icons";
import { useT } from "../../lib/i18n";
import { CARD_LABEL, Spinner } from "./controls";

export type MapCardExportStatus = { tone: "success" | "error"; text: string };

/**
 * Every way to get the card out, in one place: copy it, save the PNG, or host
 * it for a link. `waiting` explains why the buttons are held back, and the
 * status line reports how the last action went.
 */
export function MapCardExport({
  ready,
  busy,
  action,
  status,
  waiting,
  onCopy,
  onDownload,
  children,
}: {
  ready: boolean;
  busy: boolean;
  action: "download" | "copy" | "upload" | null;
  status: MapCardExportStatus | null;
  waiting: string | null;
  onCopy: () => void;
  onDownload: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <section
      aria-label={t("mapCard.export")}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-ink-700/25 p-4"
    >
      <div className="flex min-h-[1.25rem] items-center justify-between gap-3">
        <h3 className={CARD_LABEL}>{t("mapCard.export")}</h3>
        <span
          role="status"
          className={`flex min-w-0 items-center gap-2 truncate text-xs ${
            status?.tone === "error"
              ? "text-red-300"
              : status
                ? "text-emerald-300"
                : "text-slate-500"
          }`}
        >
          {status ? (
            status.text
          ) : waiting ? (
            <>
              <Spinner />
              {waiting}
            </>
          ) : null}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          onClick={onCopy}
          disabled={!ready || busy}
          className="flex items-center justify-center gap-2 py-2.5"
        >
          {action === "copy" ? <Spinner /> : <CopyIcon className="h-4 w-4" />}
          {action === "copy" ? t("mapCard.copying") : t("mapCard.copyImage")}
        </Button>
        <Button
          variant="accent"
          onClick={onDownload}
          disabled={!ready || busy}
          className="flex items-center justify-center gap-2 py-2.5"
        >
          {action === "download" ? (
            <Spinner className="border-white/40 border-t-white" />
          ) : (
            <DownloadIcon className="h-4 w-4" />
          )}
          {action === "download" ? t("mapCard.rendering") : t("mapCard.downloadPng")}
        </Button>
      </div>
      <div className="border-t border-white/[0.06] pt-4">{children}</div>
    </section>
  );
}
