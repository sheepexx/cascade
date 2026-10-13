import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import type { MessageKey } from "../../lib/i18n/core";
import {
  loadEmoji,
  QUICK_REACTIONS,
  recentEmoji,
  rememberEmoji,
  searchEmoji,
  type EmojiEntry,
  type EmojiGroup,
} from "../../lib/emoji";
import {
  klipyCustomerId,
  klipyEnabled,
  searchGifs,
  trendingGifs,
  type Gif,
} from "../../lib/klipy";
import { useDebounced } from "./socialUtils";

const GROUP_LABELS: Record<number, { key: MessageKey; icon: string }> = {
  0: { key: "social.emoji.smileys", icon: "😀" },
  1: { key: "social.emoji.people", icon: "👋" },
  3: { key: "social.emoji.nature", icon: "🐻" },
  4: { key: "social.emoji.food", icon: "🍔" },
  5: { key: "social.emoji.travel", icon: "✈️" },
  6: { key: "social.emoji.activities", icon: "⚽" },
  7: { key: "social.emoji.objects", icon: "💡" },
  8: { key: "social.emoji.symbols", icon: "🔣" },
  9: { key: "social.emoji.flags", icon: "🏳️" },
};

type Tab = "emoji" | "gif";

/**
 * The picker above the message box: emoji to put in the text, and GIFs from
 * KLIPY that send straight away. With `gifs` off it is just the emoji, for
 * reacting to a message. Closes on Escape or a click outside, except on an
 * element marked data-picker-toggle, which opens and closes it itself.
 */
export function EmojiGifPicker({
  userId,
  gifs = true,
  onEmoji,
  onGif,
  onClose,
  className = "",
}: {
  userId: string;
  gifs?: boolean;
  onEmoji: (emoji: string) => void;
  onGif?: (gif: Gif, query: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const showGifs = gifs && !!onGif && klipyEnabled();
  const [tab, setTab] = useState<Tab>("emoji");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      // The button that opened it toggles it itself.
      if (target.closest?.("[data-picker-toggle]")) return;
      if (ref.current && !ref.current.contains(target)) closeRef.current();
    };
    // Registered on the next tick so the click that opened it doesn't close it.
    const id = window.setTimeout(() => document.addEventListener("pointerdown", onPointer, true));
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={showGifs ? t("social.emojiAndGifs") : t("social.pickEmoji")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className={`flex h-[22rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-800 shadow-2xl ${className}`}
    >
      {showGifs && (
        <div role="tablist" className="flex gap-1 border-b border-white/[0.07] p-1.5">
          {(["emoji", "gif"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                tab === id ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {id === "emoji" ? t("social.emojiTab") : t("social.gifTab")}
            </button>
          ))}
        </div>
      )}
      {tab === "gif" && showGifs ? (
        <GifPanel userId={userId} onGif={onGif!} />
      ) : (
        <EmojiPanel
          onEmoji={(emoji) => {
            rememberEmoji(emoji);
            onEmoji(emoji);
          }}
        />
      )}
    </div>
  );
}

function EmojiPanel({ onEmoji }: { onEmoji: (emoji: string) => void }) {
  const t = useT();
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [recent] = useState(() => {
    const seen = recentEmoji();
    return seen.length ? seen : QUICK_REACTIONS;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadEmoji()
      .then((g) => live && setGroups(g))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(() => (groups && query.trim() ? searchEmoji(groups, query) : null), [groups, query]);

  const jump = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-group="${id}"]`);
    if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - scrollRef.current.offsetTop;
  };

  return (
    <>
      <div className="p-2 pb-1">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("social.searchEmoji")}
          aria-label={t("social.searchEmoji")}
          className="w-full rounded-lg border border-white/10 bg-ink-700/65 px-2.5 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
        />
      </div>
      {!query && groups && (
        <div className="flex justify-between px-2 pb-1">
          <GroupJump icon="🕘" label={t("social.emoji.recent")} onClick={() => jump("recent")} />
          {groups.map((g) => (
            <GroupJump key={g.id} icon={GROUP_LABELS[g.id].icon} label={t(GROUP_LABELS[g.id].key)} onClick={() => jump(String(g.id))} />
          ))}
        </div>
      )}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {failed ? (
          <p className="px-2 py-8 text-center text-xs text-slate-500">{t("social.emojiFailed")}</p>
        ) : !groups ? (
          <p className="px-2 py-8 text-center text-xs text-slate-500">{t("common.loading")}</p>
        ) : results ? (
          results.length ? (
            <EmojiGrid emojis={results} onEmoji={onEmoji} />
          ) : (
            <p className="px-2 py-8 text-center text-xs text-slate-500">{t("social.noEmojiMatch")}</p>
          )
        ) : (
          <>
            <EmojiSection id="recent" label={t("social.emoji.recent")}>
              <EmojiGrid emojis={recent.map((unicode) => ({ unicode, label: unicode, search: "" }))} onEmoji={onEmoji} />
            </EmojiSection>
            {groups.map((g) => (
              <EmojiSection key={g.id} id={String(g.id)} label={t(GROUP_LABELS[g.id].key)}>
                <EmojiGrid emojis={g.emojis} onEmoji={onEmoji} />
              </EmojiSection>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function GroupJump({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md text-sm opacity-70 grayscale transition hover:bg-white/10 hover:opacity-100 hover:grayscale-0"
    >
      {icon}
    </button>
  );
}

function EmojiSection({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section data-group={id} className="[content-visibility:auto] [contain-intrinsic-size:auto_12rem]">
      <h4 className="sticky top-0 z-10 bg-ink-800/95 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </h4>
      {children}
    </section>
  );
}

function EmojiGrid({ emojis, onEmoji }: { emojis: readonly EmojiEntry[]; onEmoji: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e) => (
        <button
          key={e.unicode}
          type="button"
          title={e.label}
          aria-label={e.label}
          onClick={() => onEmoji(e.unicode)}
          className="grid aspect-square place-items-center rounded-md text-xl leading-none transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {e.unicode}
        </button>
      ))}
    </div>
  );
}

function GifPanel({ userId, onGif }: { userId: string; onGif: (gif: Gif, query: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const term = useDebounced(query.trim(), 400);
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const customerId = useRef<Promise<string> | null>(null);
  customerId.current ??= klipyCustomerId(userId).catch(() => "");
  const abort = useRef<AbortController | null>(null);

  const load = (q: string, nextPage: number) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError(false);
    void customerId
      .current!.then((id) =>
        q ? searchGifs(q, nextPage, id, controller.signal) : trendingGifs(nextPage, id, controller.signal),
      )
      .then((result) => {
        if (controller.signal.aborted) return;
        setGifs((prev) => (nextPage === 1 ? result.gifs : [...prev, ...result.gifs]));
        setPage(nextPage);
        setHasNext(result.hasNext);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    setGifs([]);
    load(term, 1);
    return () => abort.current?.abort();
  }, [term]);

  return (
    <>
      <div className="p-2 pb-1">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("social.searchKlipy")}
          aria-label={t("social.searchKlipy")}
          className="w-full rounded-lg border border-white/10 bg-ink-700/65 px-2.5 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
        />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (!loading && hasNext && el.scrollHeight - el.scrollTop - el.clientHeight < 200) load(term, page + 1);
        }}
      >
        {gifs.length > 0 && (
          <div className="columns-2 gap-1.5">
            {gifs.map((gif, i) => (
              <button
                key={`${gif.slug}-${i}`}
                type="button"
                title={gif.title}
                aria-label={gif.title || t("social.gif")}
                onClick={() => onGif(gif, term)}
                className="mb-1.5 block w-full overflow-hidden rounded-lg bg-ink-700 bg-cover transition hover:ring-2 hover:ring-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{
                  aspectRatio: `${gif.preview.width || 1} / ${gif.preview.height || 1}`,
                  backgroundImage: gif.blur ? `url("${gif.blur}")` : undefined,
                }}
              >
                <img src={gif.preview.url} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {error ? (
          <p className="px-2 py-6 text-center text-xs text-rose-300">{t("social.gifsFailed")}</p>
        ) : loading ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500">{t("common.loading")}</p>
        ) : gifs.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500">{t("social.noGifMatch")}</p>
        ) : null}
      </div>
      <p className="border-t border-white/[0.07] px-2 py-1 text-right text-[10px] text-slate-500">{t("social.poweredByKlipy")}</p>
    </>
  );
}
