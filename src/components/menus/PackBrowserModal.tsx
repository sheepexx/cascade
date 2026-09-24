import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { SampleMapsIcon } from "../ui/StartIcons";
import type { PackSong } from "../../lib/smPackImport";
import { useT } from "../../lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  songs: PackSong[];
  onImport: (song: PackSong) => void;
  error: string | null;
  scanning: boolean;
};

export function PackBrowserModal({
  open,
  onClose,
  onBack,
  songs,
  onImport,
  error,
  scanning,
}: Props) {
  const t = useT();
  return (
    <Modal
      open={open}
      title={t("smPack.title")}
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <Button variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
      }
    >
      {scanning && (
        <p className="text-sm text-slate-400">{t("smPack.scanning")}</p>
      )}
      {error && (
        <p className="text-sm text-rose-400">{error}</p>
      )}
      {!scanning && !error && songs.length === 0 && (
        <p className="text-sm text-slate-400">
          {t("smPack.none")}
        </p>
      )}
      {!scanning && songs.length > 0 && (
        <>
          <p className="mb-4 text-xs text-slate-500">
            {t("smPack.found", { count: songs.length })}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {songs.map((song, i) => (
              <button
                key={`${song.info.dirName}-${i}`}
                type="button"
                onClick={() => onImport(song)}
                className="group flex flex-col rounded-xl border border-ink-500/60 bg-ink-700/40 p-4 text-left transition hover:border-accent/70 hover:bg-ink-700"
              >
                <div className="mb-2 flex items-center gap-2">
                  <SampleMapsIcon className="h-5 w-5 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {song.info.title || t("common.untitled")}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {song.info.artist || t("smPack.unknownArtist")}
                    </div>
                  </div>
                </div>
                {song.info.creator && (
                  <div className="mb-2 text-[11px] text-slate-500">
                    {t("smPack.by", { name: song.info.creator })}
                  </div>
                )}
                {song.info.dirName && (
                  <div className="mb-2 truncate text-[10px] text-slate-600" title={song.info.dirName}>
                    {song.info.dirName}
                  </div>
                )}
                {song.info.difficulties.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-1">
                    {song.info.difficulties.map((d, di) => (
                      <span
                        key={di}
                        className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
                        title={d.name}
                      >
                        {d.keys}K{d.name ? ` · ${d.name}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
