import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      label: string;
      onClick: () => void;
      disabled?: boolean;
      hint?: string;
      title?: string;
      danger?: boolean;
    }
  | { separator: true };

export function Menu({
  label,
  items,
  className = "",
}: {
  label: ReactNode;
  items: MenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-slate-100 ${className}`}
      >
        {label}
        <span className="text-[10px] text-slate-500">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[100] w-52 overflow-hidden rounded-xl border border-white/10 bg-ink-800/82 py-1 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl"
          >
            {items.map((item, i) =>
              "separator" in item ? (
                <div key={i} className="my-1 h-px bg-white/10" />
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                    item.danger ? "text-rose-300" : "text-slate-200"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.hint && (
                    <span className="ml-3 font-mono text-[10px] text-slate-500">
                      {item.hint}
                    </span>
                  )}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
