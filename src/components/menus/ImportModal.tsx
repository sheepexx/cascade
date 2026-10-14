import { useRef, useState, type ReactNode } from "react";
import { Modal } from "../ui/Modal";
import { Button, INPUT_CLASS } from "../ui/Controls";
import { FolderIcon, ImportIcon } from "../ui/StartIcons";
import { InfoTip } from "../ui/Tooltip";
import { MENU_ACCENTS } from "../../lib/menuTheme";
import { useT } from "../../lib/i18n";

export function ImportModal({
  open,
  onClose,
  onFile,
  onFolder,
  onImportFromOsu,
  banner,
}: {
  open: boolean;
  onClose: () => void;
  onFile: (file: File) => void;
  onFolder?: () => void;
  onImportFromOsu?: (input: string) => Promise<void>;
  /** Offer to open the map osu! is sitting on, when there is one. */
  banner?: ReactNode;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runLinkImport = async () => {
    if (!onImportFromOsu || busy || !link.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onImportFromOsu(link);
      setLink("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("importModal.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={t("importModal.title")} onClose={onClose} width="max-w-lg" accent={MENU_ACCENTS.import}>
      <div className="flex flex-col gap-3">
        {banner}
        <div className="-mx-1.5 grid gap-1 sm:grid-cols-2">
          <ImportCard
            icon={<ImportIcon className="h-6 w-6" />}
            title={t("importModal.mapFile")}
            hint=".osz, .osu, .sm, .ssc, .qua, .mc, .mcz or .zip"
            onClick={() => fileRef.current?.click()}
          />
          {onFolder && (
            <ImportCard
              icon={<FolderIcon className="h-6 w-6" />}
              title={t("importModal.songFolder")}
              hint={t("importModal.songFolderHint")}
              onClick={onFolder}
            />
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".osz,.osu,.sm,.ssc,.qua,.mc,.mcz,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />

        {onImportFromOsu && (
          <div className="border-t border-white/[0.06] pt-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runLinkImport();
                }}
                placeholder={t("importModal.linkPlaceholder")}
                disabled={busy}
                className={`${INPUT_CLASS} min-w-0 flex-1`}
              />
              <Button
                variant="primary"
                disabled={busy || !link.trim()}
                onClick={() => void runLinkImport()}
                className="whitespace-nowrap"
              >
                {busy ? t("importModal.downloading") : t("common.import")}
              </Button>
            </div>
            {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          {t("importModal.dropHint")}
          <InfoTip content={t("importModal.dropInfo")} />
        </p>
      </div>
    </Modal>
  );
}

function ImportCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-lg p-2.5 text-left transition hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/[0.06] transition group-hover:bg-accent/15 group-hover:text-accent-soft [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[0.875rem] font-semibold text-slate-100">{title}</span>
        <span className="block text-xs leading-snug text-slate-400">{hint}</span>
      </span>
    </button>
  );
}
