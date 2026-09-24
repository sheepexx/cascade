import { useEffect, useState } from "react";
import { renderPatternCard } from "../../lib/shareCard";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { useT } from "../../lib/i18n";

export function PatternImageModal({ info, onClose }: { info: Parameters<typeof renderPatternCard>[0]; onClose: () => void }) {
  const t = useT();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    let cancelled = false, objectUrl = "";
    void renderPatternCard(info).then(result => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(result); setBlob(result); setUrl(objectUrl);
    }).catch(error => { if (!cancelled) setStatus(String(error)); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [info]);
  const copy = async () => {
    if (!blob) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus(t("patternImage.copied"));
    } catch { setStatus(t("patternImage.noClipboard")); }
  };
  const download = () => {
    const link = document.createElement("a"); link.href = url;
    link.download = `${info.difficulty.replace(/[^a-z0-9_-]/gi, "_") || "pattern"}-selection.png`;
    link.click(); setStatus(t("patternImage.saved"));
  };
  return <Modal open onClose={onClose} title={t("patternImage.title")} width="max-w-xl" footer={<>
    <Button variant="primary" disabled={!blob} onClick={() => void copy()}>{t("patternImage.copy")}</Button>
    <Button disabled={!blob} onClick={download}>{t("patternImage.save")}</Button>
    <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
  </>}>
    <p className="mb-3 text-xs text-slate-400">{t("patternImage.hint")}</p>
    {url ? <div className="max-h-[55vh] overflow-auto rounded-lg border border-white/10"><img src={url} alt={t("patternImage.alt")} className="mx-auto h-auto w-full" /></div> : <p className="text-sm text-slate-400">{t("patternImage.rendering")}</p>}
    <p role="status" className="mt-3 text-xs text-teal-200">{status}</p>
  </Modal>;
}
