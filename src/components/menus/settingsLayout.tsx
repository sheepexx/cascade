import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Tooltip } from "../ui/Tooltip";
import { SettingDiagram, type DiagramName } from "../ui/SettingDiagrams";
import { SectionHeading } from "../ui/Controls";
import { useT } from "../../lib/i18n";
import { matchesSearch } from "../../lib/settingsSearch";

/**
 * The settings workspace's building blocks. A setting is a row: its name on
 * the left, its control on the right, a hairline between rows. What a setting
 * does is explained in one fixed place, the info pane beside the rows, the
 * way Ableton's Info View explains whatever is under the pointer. On a window
 * too narrow for the pane the same text falls back to a tooltip.
 */

export type SettingInfo = {
  title: string;
  text?: string;
  diagram?: DiagramName;
  value?: number;
};

type InfoState = {
  info: SettingInfo | null;
  show: (info: SettingInfo) => void;
};

const InfoContext = createContext<InfoState | null>(null);

/**
 * Settings search. While a query is set, every category renders at once and
 * each row hides itself unless its name or description matches; `matched`
 * is true inside a category or section whose own title matched, which shows
 * everything in it.
 */
type SearchState = { words: string[]; matched: boolean };

const SearchContext = createContext<SearchState>({ words: [], matched: false });

export function SettingsSearchScope({
  words,
  title,
  children,
}: {
  words: string[];
  /** A heading that, when it matches, shows the whole scope. */
  title?: string;
  children: ReactNode;
}) {
  const parent = useContext(SearchContext);
  const matched =
    words.length > 0 && (parent.matched || (title ? matchesSearch(words, title) : false));
  const value = useMemo(() => ({ words, matched }), [words, matched]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

/**
 * Content in a settings page that is not a row (a preview, a key grid, a
 * note). It is listed while searching only when its section or category
 * matched, or one of its keywords did.
 */
export function SettingsExtra({
  keywords = [],
  className,
  children,
}: {
  keywords?: string[];
  className?: string;
  children: ReactNode;
}) {
  const search = useContext(SearchContext);
  if (search.words.length && !search.matched && !matchesSearch(search.words, ...keywords)) {
    return null;
  }
  return (
    <div data-setting className={className}>
      {children}
    </div>
  );
}

export function SettingsInfoProvider({
  enabled,
  resetKey,
  children,
}: {
  /** False on narrow windows: rows then explain themselves in tooltips. */
  enabled: boolean;
  /** Changing it (the open category) clears the pane. */
  resetKey: string;
  children: ReactNode;
}) {
  const [info, setInfo] = useState<SettingInfo | null>(null);
  useEffect(() => setInfo(null), [resetKey]);
  const show = useCallback((next: SettingInfo) => {
    setInfo((prev) =>
      prev &&
      prev.title === next.title &&
      prev.text === next.text &&
      prev.diagram === next.diagram &&
      prev.value === next.value
        ? prev
        : next,
    );
  }, []);
  const value = useMemo(() => ({ info, show }), [info, show]);
  return (
    <InfoContext.Provider value={enabled ? value : null}>{children}</InfoContext.Provider>
  );
}

/** The info pane's state, or null on a window too narrow to show it. */
function useSettingsInfo() {
  return useContext(InfoContext);
}

/** The pane itself. It keeps the last setting pointed at, so the reader can
 * move the pointer away to read it. */
export function SettingsInfoPane() {
  const t = useT();
  const info = useSettingsInfo()?.info ?? null;
  if (!info || (!info.text && !info.diagram)) {
    return (
      <p className="text-xs leading-relaxed text-slate-500">{t("settings.infoEmpty")}</p>
    );
  }
  return (
    <div key={info.title} className="track-fade-in">
      <h3 className="font-display text-sm font-semibold leading-5 text-slate-100">{info.title}</h3>
      {info.text && (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{info.text}</p>
      )}
      {info.diagram && (
        <div className="mt-3">
          <SettingDiagram name={info.diagram} value={info.value} />
        </div>
      )}
    </div>
  );
}

/** A group of rows under a heading. */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const search = useContext(SearchContext);
  return (
    <SettingsSearchScope
      words={search.words}
      title={typeof title === "string" ? title : undefined}
    >
      <section className="settings-section mt-7 first:mt-0">
        {(title || action) && (
          <SectionHeading description={description} action={action} className="mb-1">
            {title}
          </SectionHeading>
        )}
        <div className="divide-y divide-white/[0.05]">{children}</div>
      </section>
    </SettingsSearchScope>
  );
}

/**
 * One setting. `indent` nests it under the row above, for a setting that
 * only applies while that one is on.
 */
export function SettingRow({
  label,
  tip,
  diagram,
  diagramValue,
  disabled = false,
  indent = false,
  stacked = false,
  children,
}: {
  label: ReactNode;
  tip?: string;
  diagram?: DiagramName;
  diagramValue?: number;
  disabled?: boolean;
  indent?: boolean;
  /** Puts the control under the label, for one too wide to sit beside it. */
  stacked?: boolean;
  children?: ReactNode;
}) {
  const pane = useSettingsInfo();
  const search = useContext(SearchContext);
  const title = typeof label === "string" ? label : "";
  const hoveredRef = useRef(false);
  const hidden =
    search.words.length > 0 && !search.matched && !matchesSearch(search.words, title, tip);
  const publish = () =>
    pane?.show({ title, text: tip, diagram, value: diagramValue });

  // A slider dragged while its row is the one explained keeps the diagram
  // in step with the value.
  useEffect(() => {
    if (hoveredRef.current) publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramValue]);

  if (hidden) return null;

  return (
    <div
      data-setting
      onMouseEnter={() => {
        hoveredRef.current = true;
        publish();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
      }}
      onFocusCapture={publish}
      className={`flex min-h-[2.75rem] gap-x-4 gap-y-2 py-1.5 transition-opacity ${
        stacked ? "flex-col justify-center py-2.5" : "items-center"
      } ${disabled ? "opacity-45" : ""} ${indent ? "ml-1 border-l border-white/[0.08] pl-4" : ""}`}
    >
      <div className="min-w-0 flex-1 text-sm text-slate-200">
        <SettingTip text={tip} diagram={diagram} value={diagramValue}>
          {label}
        </SettingTip>
      </div>
      {children && (
        <div className={`flex shrink-0 items-center gap-3 ${stacked ? "w-full" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * A setting's name. With the info pane showing it is plain text; without it
 * the explanation opens in a tooltip.
 */
export function SettingTip({
  text,
  diagram,
  value,
  children,
}: {
  text?: string;
  diagram?: DiagramName;
  value?: number;
  children: ReactNode;
}) {
  const pane = useSettingsInfo();
  if (pane || (!text && !diagram)) return <span>{children}</span>;
  return (
    <Tooltip
      content={
        <>
          {text && <p className="m-0">{text}</p>}
          {diagram && <SettingDiagram name={diagram} value={value} />}
        </>
      }
    >
      {children}
    </Tooltip>
  );
}

/** The value read-out beside a slider. */
export function SliderValue({ children }: { children: ReactNode }) {
  return (
    <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-slate-300">
      {children}
    </span>
  );
}
