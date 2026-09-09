import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Controls";
import { Modal } from "../ui/Modal";
import { MusicNoteIcon } from "../ui/Icons";
import { InfoTip } from "../ui/Tooltip";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (audio: File | null) => Promise<void>;
};

export function NewMapModal({ open, onClose, onCreate }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAudio(null);
    setBusy(false);
    setDragging(false);
  }, [open]);

  const create = async (file: File | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(file);
    } finally {
      setBusy(false);
    }
  };

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (file.type.startsWith("audio/") || /\.(mp3|ogg)$/i.test(file.name)) {
      setAudio(file);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a new map" width="max-w-xl">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-semibold text-slate-100">
            Start with the song
            <InfoTip content="Audio defines the map timeline, waveform, timing and preview. Pick it now so the editor can set everything up before you place notes." />
          </h3>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragLeave={(event) => {
            event.stopPropagation();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
          className={`flex min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
            dragging
              ? "border-accent bg-accent/10"
              : audio
                ? "border-emerald-400/50 bg-emerald-400/5"
                : "border-ink-500 bg-ink-700/35 hover:border-accent/70 hover:bg-ink-700/60"
          }`}
        >
          <MusicNoteIcon className="h-8 w-8 text-slate-400" />
          <span className="mt-3 text-sm font-semibold text-slate-100">
            {audio ? audio.name : "Choose or drop audio"}
          </span>
          <span className="mt-1 text-xs text-slate-500">
            {audio
              ? `${(audio.size / 1024 / 1024).toFixed(1)} MB · click to replace`
              : "MP3 or OGG"}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.ogg,audio/mpeg,audio/ogg"
          className="hidden"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void create(null)}
            className="text-xs text-slate-500 transition hover:text-slate-300 disabled:opacity-50"
          >
            Create without audio
          </button>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!audio || busy}
              onClick={() => void create(audio)}
            >
              {busy ? "Creating…" : "Create map"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
