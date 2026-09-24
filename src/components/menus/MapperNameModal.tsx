import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, Field, TextInput } from "../ui/Controls";
import { cleanMapperName } from "../../lib/mapperName";
import { useT } from "../../lib/i18n";

type Props = {
  open: boolean;
  target: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
  onLogin?: () => void;
};

export function MapperNameModal({
  open,
  target,
  onClose,
  onConfirm,
  onLogin,
}: Props) {
  const t = useT();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const clean = cleanMapperName(name);

  useEffect(() => {
    if (!open) return;
    setName("");
    const id = window.setTimeout(
      () => bodyRef.current?.querySelector("input")?.focus(),
      60,
    );
    return () => window.clearTimeout(id);
  }, [open]);

  const confirm = () => {
    if (!clean) return;
    onConfirm(clean);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("mapperName.title")}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="accent" onClick={confirm} disabled={!clean}>
            {t("exportCheck.export", { target })}
          </Button>
        </>
      }
    >
      <div ref={bodyRef} className="flex flex-col gap-4">
        <p className="text-sm text-slate-400">
          {t("mapperName.body")}
        </p>

        <Field label={t("packItem.mapperName")}>
          <TextInput
            value={name}
            placeholder={t("mapperName.placeholder")}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              confirm();
            }}
          />
        </Field>

        {onLogin && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 px-4 py-3">
            <span className="text-sm text-slate-400">
              {t("mapperName.loginHint")}
            </span>
            <Button
              variant="primary"
              onClick={onLogin}
              className="whitespace-nowrap"
            >
              {t("startModal.loginWithOsu")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
