import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { useT } from "../../lib/i18n";

type Props = {
  open: boolean;
  difficultyName: string;
  path: string;
  busy: boolean;
  error: string | null;
  onOpenEditor: () => void;
  onShowInFolder: () => void;
  onApply: () => void;
  onCancel: () => void;
};

/** Stays open while the difficulty is out in a text editor. */
export function ExternalEditModal({
  open,
  difficultyName,
  path,
  busy,
  error,
  onOpenEditor,
  onShowInFolder,
  onApply,
  onCancel,
}: Props) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      title={t("externalEdit.title", { name: difficultyName })}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            {t("externalEdit.discard")}
          </Button>
          <Button variant="accent" onClick={onApply} disabled={busy}>
            {busy ? t("externalEdit.applying") : t("externalEdit.apply")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-slate-300">
        <p>{t("externalEdit.body")}</p>
        <code className="block select-all break-all rounded-lg bg-black/30 px-3 py-2 text-xs text-slate-400">
          {path}
        </code>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenEditor} disabled={busy}>
            {t("externalEdit.openEditor")}
          </Button>
          <Button variant="ghost" onClick={onShowInFolder} disabled={busy}>
            {t("externalEdit.showInFolder")}
          </Button>
        </div>
        <p className="text-xs text-slate-500">{t("externalEdit.note")}</p>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
