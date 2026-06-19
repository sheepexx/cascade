import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, Field, TextInput } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import { useAuth } from "../../lib/auth";
import { publishPreset } from "../../lib/presets";
import type { PatternNote } from "../../lib/patterns";

/**
 * Publish a copied pattern as a shared preset. Submitting creates a `pending`
 * preset for an admin to approve.
 */
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
  const [status, setStatus] = useState<null | "saving" | "done" | "error">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setTags("");
      setStatus(null);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!user || !pattern || !name.trim()) return;
    setStatus("saving");
    setError(null);
    try {
      await publishPreset({
        authorId: user.id,
        name: name.trim(),
        keyCount,
        description: description.trim(),
        pattern,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish.");
      setStatus("error");
    }
  };

  return (
    <Modal
      open={open}
      title="Publish pattern as preset"
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
              {status === "saving" ? "Publishing…" : "Publish"}
            </Button>
          </>
        )
      }
    >
      {status === "done" ? (
        <p className="text-sm text-slate-300">
          Submitted! Your preset is now <strong>pending review</strong>. Once an
          admin approves it, it'll appear in the preset browser for everyone.
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
