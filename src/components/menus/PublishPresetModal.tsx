import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, Field, TextInput } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import { useAuth } from "../../lib/auth";
import {
  publishPreset,
  savePrivatePreset,
  DuplicatePresetError,
} from "../../lib/presets";
import type { PatternNote } from "../../lib/patterns";

export function PublishPresetModal({
  open,
  onClose,
  pattern,
  keyCount,
}: {
  open: boolean;
  onClose: () => void;
  pattern: PatternNote[] | null;
  keyCount: number;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [status, setStatus] = useState<null | "saving" | "done" | "error">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setTags("");
      setVisibility("private");
      setStatus(null);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!user || !pattern || !name.trim()) return;
    setStatus("saving");
    setError(null);
    try {
      const input = {
        authorId: user.id,
        authorUsername: user.username,
        authorOsuId: user.osu_id,
        name: name.trim(),
        keyCount,
        description: description.trim(),
        pattern,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (visibility === "public") await publishPreset(input);
      else await savePrivatePreset(input);
      setStatus("done");
    } catch (err) {
      setError(
        err instanceof DuplicatePresetError
          ? "This exact pattern already exists as a public preset, so it can't be submitted again."
          : err instanceof Error
            ? err.message
            : "Failed to save.",
      );
      setStatus("error");
    }
  };

  return (
    <Modal
      open={open}
      title="Save pattern as preset"
      onClose={onClose}
      width="max-w-md"
      footer={
        status === "done" ? (
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="accent"
              onClick={() => void submit()}
              disabled={!name.trim() || status === "saving"}
            >
              {status === "saving"
                ? "Saving..."
                : visibility === "public"
                  ? "Submit public preset"
                  : "Save private preset"}
            </Button>
          </>
        )
      }
    >
      {status === "done" ? (
        <p className="text-sm text-slate-300">
          {visibility === "public" ? (
            <>
              Submitted. Your preset is now <strong>pending review</strong>.
              Once an admin approves it, it will appear in the preset browser for
              everyone.
            </>
          ) : (
            <>
              Saved. This preset is synced to your account and is only visible to
              you.
            </>
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-ink-600 bg-ink-700/40 p-3">
            {pattern && pattern.length ? (
              <PatternPreview
                pattern={pattern}
                keyCount={keyCount}
                size="large"
              />
            ) : (
              <span className="text-xs text-slate-500">No pattern selected.</span>
            )}
            <div className="text-xs text-slate-400">
              {keyCount}K · {pattern?.length ?? 0} notes
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility("private")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                visibility === "private"
                  ? "border-accent/70 bg-accent/20 text-slate-100"
                  : "border-white/10 bg-ink-700/40 text-slate-400 hover:bg-ink-700"
              }`}
            >
              Private
            </button>
            <button
              type="button"
              onClick={() => setVisibility("public")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                visibility === "public"
                  ? "border-accent/70 bg-accent/20 text-slate-100"
                  : "border-white/10 bg-ink-700/40 text-slate-400 hover:bg-ink-700"
              }`}
            >
              Public review
            </button>
          </div>
          <Field label="Name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 4K jumpstream burst"
              maxLength={80}
            />
          </Field>
          <Field label="Description" hint="Optional.">
            <TextInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this pattern good for?"
              maxLength={200}
            />
          </Field>
          <Field label="Tags" hint="Comma-separated, optional.">
            <TextInput
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="stream, jack, tech"
            />
          </Field>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
