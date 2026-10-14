import type { BackgroundScope } from "../../types";
import { Modal } from "../ui/Modal";
import { useT } from "../../lib/i18n";

type Props = {
  open: boolean;
  previewUrl: string | null;
  onChoose: (scope: BackgroundScope) => void;
  onClose: () => void;
};

export function BackgroundScopeModal({
  open,
  previewUrl,
  onChoose,
  onClose,
}: Props) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t("bgScope.title")}>
      <div className="flex flex-col gap-4">
        {previewUrl && (
          <img
            src={previewUrl}
            alt={t("bgScope.previewAlt")}
            className="h-32 w-full rounded-lg object-cover"
          />
        )}
        <p className="text-sm text-slate-300">
          {t("bgScope.question")}
        </p>
        <div className="grid gap-2">
          <button
            onClick={() => onChoose("mapset")}
            className="rounded-lg bg-white/[0.04] px-4 py-3 text-left ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.07] hover:ring-white/[0.12]"
          >
            <div className="text-sm font-semibold text-slate-100">
              {t("bgScope.mapset")}
            </div>
            <div className="text-xs text-slate-400">
              {t("bgScope.mapsetHint")}
            </div>
          </button>
          <button
            onClick={() => onChoose("difficulty")}
            className="rounded-lg bg-white/[0.04] px-4 py-3 text-left ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.07] hover:ring-white/[0.12]"
          >
            <div className="text-sm font-semibold text-slate-100">
              {t("bgScope.difficulty")}
            </div>
            <div className="text-xs text-slate-400">
              {t("bgScope.difficultyHint")}
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
}
