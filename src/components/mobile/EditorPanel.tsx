import type { ReactNode } from "react";
import { Modal } from "../ui/Modal";

/** Keeps the desktop overlay and phone sheet on the same editing actions. */
export function EditorPanel({ mobile, open, title, onClose, children }: { mobile?: boolean; open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!mobile) return <>{children}</>;
  return <Modal open={open} title={title} onClose={onClose}><div className="phone-editor-panel flex flex-col gap-4">{children}</div></Modal>;
}
