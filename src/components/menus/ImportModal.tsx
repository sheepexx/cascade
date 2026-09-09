import { useRef, useState, type ReactNode } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { FolderIcon, ImportIcon } from "../ui/StartIcons";
import { InfoTip } from "../ui/Tooltip";

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
      setError(e instanceof Error ? e.message : "Import failed - try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Import a map" onClose={onClose} width="max-w-lg">
      <div className="flex flex-col gap-3">
        {banner}
        <div className="grid gap-3 sm:grid-cols-2">
          <ImportCard
            icon={<ImportIcon className="h-6 w-6" />}
            title="Map file"
            hint=".osz, .osu, .sm, .ssc, .qua or .zip"
            onClick={() => fileRef.current?.click()}
          />
          {onFolder && (
            <ImportCard
              icon={<FolderIcon className="h-6 w-6" />}
              title="Song folder"
              hint="A StepMania / Etterna pack folder"
              onClick={onFolder}
            />
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".osz,.osu,.sm,.ssc,.qua,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />

        {onImportFromOsu && (
          <div className="rounded-xl border border-ink-500/60 bg-ink-700/40 px-4 py-3">
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
                placeholder="osu! beatmap link or ID"
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/70 focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
              />
              <Button
                variant="accent"
                disabled={busy || !link.trim()}
                onClick={() => void runLinkImport()}
                className="whitespace-nowrap"
              >
                {busy ? "Downloading…" : "Import"}
              </Button>
            </div>
            {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          You can also drop files anywhere on the page.
          <InfoTip content="Drag a map file, an audio file or a song folder onto the page. With a map open, dropping .osu files of the same song adds them as difficulties, no audio file needed." />
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
      className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-4 text-left transition hover:border-accent/70 hover:bg-ink-700"
    >
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
        {icon}
      </span>
      <span className="text-sm font-semibold text-slate-100">{title}</span>
      <span className="text-xs text-slate-400">{hint}</span>
    </button>
  );
}
