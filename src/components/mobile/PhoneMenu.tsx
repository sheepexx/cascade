import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "../ui/Modal";
import { INPUT_CLASS, SectionHeading } from "../ui/Controls";
import type { PaletteCommand } from "../ui/CommandPalette";
import { searchCommands } from "../../lib/paletteSearch";
import { useT } from "../../lib/i18n";

/** The same commands as the desktop palette, with every group browsable. */
export function PhoneMenu({ open, onClose, commands, children }: {
  open: boolean; onClose: () => void; commands: PaletteCommand[]; children?: ReactNode;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  useEffect(() => { if (open) setQuery(""); }, [open]);
  const groups = useMemo(() => {
    const found = query.trim() ? searchCommands(commands, query) : commands.filter(c => !c.id.startsWith("setting-"));
    const grouped = new Map<string, PaletteCommand[]>();
    for (const command of found) grouped.set(command.group, [...(grouped.get(command.group) ?? []), command]);
    const entries = [...grouped];
    if (!query.trim()) {
      const order = [t("palette.group.editor"), t("palette.group.edit"), t("palette.group.playback"), t("palette.group.timing"), t("palette.group.view"), t("palette.group.file"), t("palette.group.export")];
      entries.sort(([a], [b]) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length));
    }
    return entries;
  }, [commands, query, t]);
  return <Modal open={open} onClose={onClose} title={t("mobile.allTools")} height="h-[85dvh]">
    <div className="phone-tool-menu">
      <div className="sticky -top-4 z-10 bg-ink-800 py-4"><input type="search" aria-label={t("palette.searchLabel")} placeholder={t("palette.placeholder")} className={`${INPUT_CLASS} w-full`} value={query} onChange={e => setQuery(e.target.value)} /></div>
      {!query && children && <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">{children}</div>}
      {groups.map(([group, items]) => <section key={group} className="mb-5">
        <SectionHeading className="mb-2">{group}</SectionHeading>
        <div className="grid grid-cols-2 gap-1">
          {items.map(c => <button type="button" key={c.id} disabled={c.disabled} className="phone-tool-item rounded-md bg-white/[0.04] px-3 py-2 text-left text-sm hover:bg-white/[0.08] disabled:opacity-40" onClick={() => { onClose(); window.setTimeout(c.run, 0); }}>
            {c.label}
          </button>)}
        </div>
      </section>)}
      {!groups.length && <p className="py-6 text-center text-slate-400">{t("palette.noMatch", { query })}</p>}
    </div>
  </Modal>;
}
