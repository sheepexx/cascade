import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, Field, TextInput } from "../ui/Controls";
import { cleanMapperName } from "../../lib/mapperName";

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
      title="Who mapped this?"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={confirm} disabled={!clean}>
            {`Export ${target}`}
          </Button>
        </>
      }
    >
      <div ref={bodyRef} className="flex flex-col gap-4">
        <p className="text-sm text-slate-400">
          This map has no mapper name yet. It goes into the Creator field of the
          exported file, and osu! shows it on the beatmap.
        </p>

        <Field label="Mapper name">
          <TextInput
            value={name}
            placeholder="Your osu! username"
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
              Log in and Cascade fills this in from your osu! account.
            </span>
            <Button
              variant="primary"
              onClick={onLogin}
              className="whitespace-nowrap"
            >
              Log in with osu!
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
