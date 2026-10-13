import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { searchUsers, type ProfileCard, type Relationship } from "../../lib/social";
import type { SocialRoute } from "../../lib/socialRoute";
import { SkeletonRows } from "../ui/Skeleton";
import { useRelationship } from "./useRelationship";
import { rankedCountOf, useRankedCounts } from "./useRankedCounts";
import {
  EmptyState,
  ErrorLine,
  SearchIcon,
  SmallButton,
  UserRow,
} from "./socialUi";
import { errorText, useDebounced } from "./socialUtils";

const PAGE = 20;

/**
 * Username search with a debounce, pages of results and the right friend
 * action on each row. Results carry only what a profile card shows.
 */
export function PeopleSearch({
  onNavigate,
  onChanged,
  autoFocus = false,
  placeholder,
}: {
  onNavigate: (route: SocialRoute) => void;
  onChanged?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 250);
  const [results, setResults] = useState<ProfileCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const ranked = useRankedCounts(results);

  const run = (term: string, offset: number) => {
    const id = ++requestRef.current;
    setLoading(true);
    setError(null);
    searchUsers(term, PAGE, offset)
      .then((page) => {
        if (id !== requestRef.current) return;
        setResults((prev) => (offset === 0 ? page.users : [...prev, ...page.users]));
        setTotal(page.total);
      })
      .catch((e: unknown) => {
        if (id === requestRef.current) setError(errorText(e, t("social.searchFailed")));
      })
      .finally(() => {
        if (id === requestRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    if (!debounced) {
      requestRef.current++;
      setResults([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }
    run(debounced, 0);
    // run is recreated each render; the search only follows the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const update = (id: string, relationship: Relationship) => {
    setResults((prev) => prev.map((u) => (u.id === id ? { ...u, relationship } : u)));
    onChanged?.();
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="relative">
        <span className="sr-only">{t("social.searchPeople")}</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          maxLength={32}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? t("social.searchPeoplePlaceholder")}
          aria-describedby="people-search-status"
          className="w-full rounded-xl border border-white/10 bg-ink-700/65 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
        />
      </label>
      <p id="people-search-status" className="sr-only" aria-live="polite">
        {debounced && !loading ? t("social.resultsCount", { count: total }) : ""}
      </p>

      {error ? (
        <ErrorLine message={error} onRetry={() => run(debounced, 0)} />
      ) : !debounced ? null : loading && results.length === 0 ? (
        <SkeletonRows count={3} avatar label={t("social.searching")} />
      ) : results.length === 0 ? (
        <EmptyState title={t("social.noResults", { query: debounced })} body={t("social.noResultsHint")} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {results.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onOpen={() => onNavigate({ view: "profile", name: user.username, tab: "overview" })}
                detail={<SearchDetail user={user} ranked={rankedCountOf(user, ranked)} />}
              >
                <FriendButton user={user} onChange={(rel) => update(user.id, rel)} />
              </UserRow>
            ))}
          </ul>
          {results.length < total && (
            <div className="flex justify-center">
              <SmallButton onClick={() => run(debounced, results.length)} disabled={loading}>
                {loading ? t("common.loading") : t("social.loadMore")}
              </SmallButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchDetail({ user, ranked }: { user: ProfileCard; ranked: number | null }) {
  const t = useT();
  const parts: string[] = [];
  if (user.presence?.online) parts.push(t("social.online"));
  if (ranked !== null) parts.push(t("social.rankedCount", { count: ranked }));
  if (user.osu?.loved_count) parts.push(t("social.lovedCount", { count: user.osu.loved_count }));
  return <>{parts.join(" · ") || "\u00a0"}</>;
}

/** The one friend action that fits where the caller stands with this person. */
export function FriendButton({
  user,
  onChange,
}: {
  user: ProfileCard;
  onChange: (relationship: Relationship) => void;
}) {
  const t = useT();
  const { busy, run } = useRelationship(user.id, user.relationship, onChange);
  switch (user.relationship) {
    case "self":
      return <span className="px-2 text-xs text-slate-500">{t("social.you")}</span>;
    case "friends":
      return <span className="px-2 text-xs text-emerald-300">{t("social.friends")}</span>;
    case "incoming":
      return (
        <SmallButton tone="accent" onClick={() => void run("accept")} disabled={busy !== null}>
          {t("social.accept")}
        </SmallButton>
      );
    case "outgoing":
      return (
        <SmallButton onClick={() => void run("cancel")} disabled={busy !== null} title={t("social.cancelRequest")}>
          {t("social.requested")}
        </SmallButton>
      );
    case "blocked":
      return (
        <SmallButton onClick={() => void run("unblock")} disabled={busy !== null}>
          {t("social.unblock")}
        </SmallButton>
      );
    default:
      return (
        <SmallButton onClick={() => void run("add")} disabled={busy !== null}>
          {t("social.addFriend")}
        </SmallButton>
      );
  }
}
