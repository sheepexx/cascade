import { useEffect, useState } from "react";
import { useT } from "../../lib/i18n";
import { discoverUsers, type ProfileCard, type Relationship } from "../../lib/social";
import type { SocialRoute } from "../../lib/socialRoute";
import { Skeleton } from "../ui/Skeleton";
import { FriendButton, PeopleSearch } from "./PeopleSearch";
import { Avatar, Flag, PresenceLine, SectionCard } from "./socialUi";

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
    <div className="flex flex-col gap-5">
      <SectionCard title={t("social.findMappers")}>
        <PeopleSearch onNavigate={onNavigate} onChanged={onChanged} placeholder={t("social.searchMappersPlaceholder")} />
      </SectionCard>

      {(!lists || lists.featured.length > 0) && (
        <SectionCard title={t("social.featuredMappers")} aside={<span className="text-[11px] text-slate-500">{t("social.featuredHint")}</span>}>
          <PeopleGrid users={lists?.featured ?? null} onNavigate={onNavigate} onChange={update} detail="ranked" />
        </SectionCard>
      )}
      <SectionCard title={t("social.recentlyActive")}>
        <PeopleGrid users={lists?.recent ?? null} onNavigate={onNavigate} onChange={update} detail="presence" />
      </SectionCard>
    </div>
  );
}

function PeopleGrid({
  users,
  onNavigate,
  onChange,
  detail,
}: {
  users: ProfileCard[] | null;
  onNavigate: (route: SocialRoute) => void;
  onChange: (id: string, relationship: Relationship) => void;
  detail: "ranked" | "presence";
}) {
  const t = useT();
  if (!users) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} step={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }
  if (users.length === 0) return <p className="text-sm text-slate-500">{t("social.nobodyYet")}</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {users.map((user) => (
        <li
          key={user.id}
          className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-ink-800/40 p-3 text-center transition hover:border-white/10 hover:bg-ink-700/50"
        >
          <button
            type="button"
            onClick={() => onNavigate({ view: "profile", name: user.username, tab: "overview" })}
            className="flex w-full min-w-0 flex-col items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Avatar url={user.avatar_url} name={user.username} size="lg" presence={user.presence} />
            <span className="flex max-w-full items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-slate-100">{user.username}</span>
              <Flag code={user.country_code} className="h-3" />
            </span>
            <span className="h-4 max-w-full truncate text-[11px] text-slate-500">
              {detail === "ranked" && user.osu ? (
                t("social.rankedCount", { count: user.osu.ranked_count })
              ) : (
                <PresenceLine presence={user.presence} className="justify-center" />
              )}
            </span>
          </button>
          <FriendButton user={user} onChange={(rel) => onChange(user.id, rel)} />
        </li>
      ))}
    </ul>
  );
}
