import { useEffect, useState } from "react";
import { useT } from "../../lib/i18n";
import { discoverUsers, type ProfileCard, type Relationship } from "../../lib/social";
import type { SocialRoute } from "../../lib/socialRoute";
import { Skeleton } from "../ui/Skeleton";
import { rankedCountOf, useRankedCounts } from "./useRankedCounts";
import { FriendButton, PeopleSearch } from "./PeopleSearch";
import { AdminBadge, Avatar, Flag, PresenceLine, SectionCard } from "./socialUi";

/**
 * Finding mappers: username search, people who signed in lately, and the
 * Cascade users with the most ranked maps on osu! (public osu! numbers;
 * nobody is ranked by time spent mapping).
 */
export function CommunityView({
  onNavigate,
  onChanged,
}: {
  onNavigate: (route: SocialRoute) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [lists, setLists] = useState<{ recent: ProfileCard[]; featured: ProfileCard[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    discoverUsers(12)
      .then((result) => {
        if (!cancelled) setLists(result);
      })
      .catch(() => {
        if (!cancelled) setLists({ recent: [], featured: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (id: string, relationship: Relationship) => {
    setLists((prev) =>
      prev
        ? {
            recent: prev.recent.map((u) => (u.id === id ? { ...u, relationship } : u)),
            featured: prev.featured.map((u) => (u.id === id ? { ...u, relationship } : u)),
          }
        : prev,
    );
    onChanged();
  };

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h3 className="mb-3 font-display text-xl font-bold text-slate-50">{t("social.findMappers")}</h3>
        <PeopleSearch onNavigate={onNavigate} onChanged={onChanged} placeholder={t("social.searchMappersPlaceholder")} />
      </section>

      {(!lists || lists.featured.length > 0) && (
        <SectionCard title={t("social.featuredMappers")} aside={<span className="text-xs text-slate-500">{t("social.featuredHint")}</span>}>
          <PeopleGrid users={lists?.featured ?? null} onNavigate={onNavigate} onChange={update} />
        </SectionCard>
      )}
      <SectionCard title={t("social.recentlyActive")}>
        <PeopleGrid users={lists?.recent ?? null} onNavigate={onNavigate} onChange={update} />
      </SectionCard>
    </div>
  );
}

function PeopleGrid({
  users,
  onNavigate,
  onChange,
}: {
  users: ProfileCard[] | null;
  onNavigate: (route: SocialRoute) => void;
  onChange: (id: string, relationship: Relationship) => void;
}) {
  const t = useT();
  const ranked = useRankedCounts(users);
  if (!users) {
    return (
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton step={i} className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton step={i} className="h-3.5 w-28 rounded" />
              <Skeleton step={i} className="h-2.5 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (users.length === 0) return <p className="text-sm text-slate-500">{t("social.nobodyYet")}</p>;
  return (
    // A directory, not a wall of cards: two columns of rows that read like a
    // roster, the ranked count beside each name as the stat that matters.
    <ul className="grid gap-x-6 gap-y-px md:grid-cols-2">
      {users.map((user) => (
        <li
          key={user.id}
          className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]"
        >
          <button
            type="button"
            onClick={() => onNavigate({ view: "profile", name: user.username, tab: "overview" })}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Avatar url={user.avatar_url} name={user.username} presence={user.presence} />
            <span className="min-w-0 flex-1">
              <span className="flex max-w-full items-center gap-1.5">
                <span className="truncate font-display text-[0.9375rem] font-semibold text-slate-50">{user.username}</span>
                {user.is_admin && <AdminBadge compact />}
                <Flag code={user.country_code} className="h-3" />
              </span>
              <span className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
                <span className="shrink-0 tabular-nums">
                  <RankedLine count={rankedCountOf(user, ranked)} />
                </span>
                {user.presence?.online && (
                  <PresenceLine presence={user.presence} className="min-w-0 text-slate-500" />
                )}
              </span>
            </span>
          </button>
          <FriendButton user={user} onChange={(rel) => onChange(user.id, rel)} />
        </li>
      ))}
    </ul>
  );
}

/** "12 ranked maps", or a placeholder while the count is on its way. */
export function RankedLine({ count }: { count: number | null }) {
  const t = useT();
  if (count === null) return <span className="inline-block h-2.5 w-20 animate-pulse rounded bg-white/[0.06] align-middle" />;
  return <>{t("social.rankedCount", { count })}</>;
}
