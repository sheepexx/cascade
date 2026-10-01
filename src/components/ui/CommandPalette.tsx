import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useDialog } from "../../hooks/useDialog";
import {
  loadRecentCommands,
  orderByRecency,
  rememberCommand,
} from "../../lib/commandRecents";
import { MOTION } from "../../lib/motion";
import {
  markNewSeen,
  retireNewBadge,
  searchCommands,
  showNewBadge,
} from "../../lib/paletteSearch";
import { playUiSound } from "../../lib/uiSounds";
import { useT } from "../../lib/i18n";

export type PaletteCommand = {
  id: string;
  label: string;
  group: string;
  /** Words that make the command findable without ranking it up. */
  keywords?: string;
  /** Other names for the command; a match ranks nearly as high as the label. */
  aliases?: readonly string[];
  /** The keyboard shortcut, shown at the end of the row. */
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Recently added: shows a New badge until used or two weeks have passed. */
  isNew?: boolean;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}) {
  const t = useT();
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useDialog(open && mounted);

  const [recents, setRecents] = useState<string[]>(loadRecentCommands);

  const [newSeen, setNewSeen] = useState<Record<string, number>>({});
  // Read when the palette opens; the list itself is rebuilt on every render.
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const results = useMemo(() => {
    const matched = searchCommands(commands, query);
    // Recents only reorder the unfiltered list. Once someone types, their
    // query is the stronger signal and ranking stays as it was.
    return (query ? matched : orderByRecency(matched, recents)).slice(0, 60);
  }, [commands, query, recents]);

  useEffect(() => {
    if (open) {
      playUiSound("open");
      setMounted(true);
      setClosing(false);
      setQuery("");
      setSelected(0);
      setRecents(loadRecentCommands());
      setNewSeen(markNewSeen(commandsRef.current.filter((c) => c.isNew).map((c) => c.id)));
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
      return;
    }
    if (!mounted) return;
    playUiSound("close");
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, MOTION.exit);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    if (selected < results.length) return;
    setSelected(Math.max(0, results.length - 1));
  }, [results.length, selected]);

  if (!mounted) return null;

  const run = (command: PaletteCommand) => {
    if (command.disabled) return;
    setRecents(rememberCommand(command.id));
    if (command.isNew) setNewSeen(retireNewBadge(command.id));
    onClose();
    // Let the palette begin its exit before an underlying modal opens.
    window.setTimeout(command.run, 0);
  };

  return createPortal(
    <div
      className={`command-palette-backdrop fixed inset-0 z-[300] flex justify-center bg-ink-900/65 px-4 pt-[min(16vh,9rem)] backdrop-blur-md ${
        closing ? "is-closing" : ""
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        tabIndex={-1}
        className={`command-palette-panel flex h-fit max-h-[min(68vh,38rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-800/95 shadow-[0_30px_100px_rgba(0,0,0,0.68)] outline-none ${
          closing ? "is-closing" : ""
        }`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelected((value) => Math.min(results.length - 1, value + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelected((value) => Math.max(0, value - 1));
          } else if (event.key === "Enter" && results[selected]) {
            event.preventDefault();
            run(results[selected]);
          }
        }}
      >
        <label className="flex items-center gap-3 border-b border-white/10 px-4">
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0 text-cyan-300">
            <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.searchLabel")}
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded-md border border-white/10 bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{t("palette.esc")}</kbd>
        </label>

        <div role="listbox" className="min-h-0 overflow-y-auto p-2">
          {results.length ? (
            results.map((command, index) => (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={selected === index}
                disabled={command.disabled}
                onMouseMove={() => setSelected(index)}
                onClick={() => run(command)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-35 ${
                  selected === index ? "bg-cyan-300/12 text-white" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm ${
                  selected === index ? "bg-cyan-300/15 text-cyan-200" : "bg-white/5 text-slate-400"
                }`}>
                  {command.icon ?? <span aria-hidden>›</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{command.label}</span>
                    {command.isNew && showNewBadge(command.id, newSeen, recents) && (
                      <span className="shrink-0 rounded-full bg-accent/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
                        {t("palette.new")}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">{command.group}</span>
                </span>
                {command.hint && (
                  <kbd className="shrink-0 rounded-md border border-white/10 bg-black/15 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                    {command.hint}
                  </kbd>
                )}
              </button>
            ))
          ) : (
            <div className="grid min-h-36 place-items-center px-6 text-center text-sm text-slate-500">
              {t("palette.noMatch", { query })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[10px] text-slate-500">
          <span><kbd className="font-mono text-slate-400">↑↓</kbd> {t("palette.navigate")}</span>
          <span><kbd className="font-mono text-slate-400">{t("palette.enter")}</kbd> {t("palette.run")}</span>
          <span className="ml-auto">Ctrl K</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
