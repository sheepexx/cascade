import { useEffect, useState } from "react";
import { renderPatternCard } from "../../lib/shareCard";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";

export function PatternImageModal({ info, onClose }: { info: Parameters<typeof renderPatternCard>[0]; onClose: () => void }) {
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
      setStatus("PNG copied. Paste it into your chat.");
    } catch { setStatus("Image clipboard is unavailable here. Save the PNG to share it."); }
  };
  const download = () => {
    const link = document.createElement("a"); link.href = url;
    link.download = `${info.difficulty.replace(/[^a-z0-9_-]/gi, "_") || "pattern"}-selection.png`;
    link.click(); setStatus("PNG saved.");
  };
  return <Modal open onClose={onClose} title="Copy selection as image" width="max-w-xl" footer={<>
    <Button variant="primary" disabled={!blob} onClick={() => void copy()}>Copy PNG</Button>
    <Button disabled={!blob} onClick={download}>Save PNG</Button>
    <Button variant="ghost" onClick={onClose}>Close</Button>
  </>}>
    <p className="mb-3 text-xs text-slate-400">The complete selection, including long notes and timing labels.</p>
    {url ? <div className="max-h-[55vh] overflow-auto rounded-lg border border-white/10"><img src={url} alt="Selected note pattern" className="mx-auto h-auto w-full" /></div> : <p className="text-sm text-slate-400">Rendering pattern…</p>}
    <p role="status" className="mt-3 text-xs text-teal-200">{status}</p>
  </Modal>;
}
