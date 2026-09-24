import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, Field, TextInput } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import { SnapBadge } from "../ui/SnapBadge";
import { useAuth } from "../../lib/auth";
import { logAnalyticsEvent } from "../../lib/analytics";
import {
  publishPreset,
  savePrivatePreset,
  DuplicatePresetError,
} from "../../lib/presets";
import type { PatternNote } from "../../lib/patterns";
import { useT } from "../../lib/i18n";

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
  const t = useT();
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
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      if (visibility === "public") {
        await publishPreset(input);
        void logAnalyticsEvent("preset_published", user.id).catch(() => {});
      } else {
        await savePrivatePreset(input);
      }
      setStatus("done");
    } catch (err) {
      setError(
        err instanceof DuplicatePresetError
          ? t("publishPreset.duplicate")
          : err instanceof Error
            ? err.message
            : t("publishPreset.saveFailed"),
      );
      setStatus("error");
    }
  };

  return (
    <Modal
      open={open}
      title={t("publishPreset.title")}
      onClose={onClose}
      width="max-w-md"
      footer={
        status === "done" ? (
          <Button variant="accent" onClick={onClose}>
            {t("common.done")}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              variant="accent"
              onClick={() => void submit()}
              disabled={!name.trim() || status === "saving"}
            >
              {status === "saving"
                ? t("publishPreset.saving")
                : visibility === "public"
                  ? t("publishPreset.submitPublic")
                  : t("publishPreset.savePrivate")}
            </Button>
          </>
        )
      }
    >
      {status === "done" ? (
        <p className="text-sm text-slate-300">
          {visibility === "public" ? (
            <>
              {t("publishPreset.submittedBefore")}{" "}
              <strong>{t("publishPreset.pending")}</strong>
              {t("publishPreset.submittedAfter")}
            </>
          ) : (
            <>
              {t("publishPreset.savedPrivate")}
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
              <span className="text-xs text-slate-500">{t("publishPreset.noPattern")}</span>
            )}
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
              <span>
                {keyCount}K · {t("diffModal.notes", { count: pattern?.length ?? 0 })}
              </span>
              {pattern && <SnapBadge pattern={pattern} />}
            </div>
          </div>
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
            {t("publishPreset.rankNote")}
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
              {t("publishPreset.private")}
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
              {t("publishPreset.public")}
            </button>
          </div>
          <Field label={t("common.name")}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("publishPreset.namePlaceholder")}
              maxLength={80}
            />
          </Field>
          <Field label={t("publishPreset.description")} hint={t("publishPreset.optional")}>
            <TextInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("publishPreset.descriptionPlaceholder")}
              maxLength={200}
            />
          </Field>
          <Field label={t("pack.tags")} hint={t("publishPreset.tagsHint")}>
            <TextInput
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("publishPreset.tagsPlaceholder")}
            />
          </Field>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
