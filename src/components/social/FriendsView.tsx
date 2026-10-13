import { useCallback, useEffect, useState } from "react";
import { useT } from "../../lib/i18n";
import { listFriends, openConversation, type FriendLists, type ProfileCard, type Relationship } from "../../lib/social";
import type { FriendsTab, SocialRoute } from "../../lib/socialRoute";
import { SegmentedControl } from "../ui/Controls";
import { Menu } from "../ui/Menu";
import { SkeletonRows } from "../ui/Skeleton";
import { PeopleSearch } from "./PeopleSearch";
import { useRelationship } from "./useRelationship";
import {
  ChatIcon,
  DotsIcon,
  EmptyState,
  ErrorLine,
  PeopleIcon,
  SmallButton,
  UserRow,
} from "./socialUi";
import { errorText, relativeTime, useNotice } from "./socialUtils";

/**
 * Friends, requests in both directions, finding people to add, and the
 * block list. Reloads when the overlay hears of a friend notification.
 */
export function FriendsView({
  tab,
  refreshKey,
  onNavigate,
  onChanged,
}: {
  tab: FriendsTab;
  refreshKey: number;
  onNavigate: (route: SocialRoute, replace?: boolean) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [lists, setLists] = useState<FriendLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listFriends()
      .then((result) => {
        if (!cancelled) setLists(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e, t("social.friendsFailed")));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reload, t]);

  const changed = useCallback(() => {
    onChanged();
    setReload((n) => n + 1);
  }, [onChanged]);

  const online = lists?.friends.filter((f) => f.presence?.online) ?? [];
  const pendingCount = lists?.incoming.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        className="no-scrollbar overflow-x-auto [&_button]:whitespace-nowrap"
        value={tab}
        onChange={(next) => onNavigate({ view: "friends", tab: next }, true)}
        options={[
          { value: "all", label: <TabLabel text={t("social.friendsAll")} count={lists?.friends.length} /> },
          { value: "online", label: <TabLabel text={t("social.online")} count={lists ? online.length : undefined} /> },
          { value: "pending", label: <TabLabel text={t("social.pending")} count={pendingCount || undefined} badge /> },
          { value: "add", label: t("social.addFriends") },
          { value: "blocked", label: t("social.blockedTab") },
        ]}
      />

      {tab === "add" ? (
        <PeopleSearch onNavigate={onNavigate} onChanged={changed} autoFocus />
      ) : error ? (
        <ErrorLine message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !lists ? (
        <SkeletonRows count={4} avatar label={t("common.loading")} />
      ) : tab === "pending" ? (
        <PendingLists lists={lists} onNavigate={onNavigate} onChanged={changed} />
      ) : tab === "blocked" ? (
        lists.blocked.length === 0 ? (
          <EmptyState title={t("social.noBlocked")} body={t("social.noBlockedHint")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {lists.blocked.map((user) => (
              <PersonRow
                key={user.id}
                user={user}
                detail={t("social.blockedWhen", { when: relativeTime(user.blocked_at, t) })}
                onNavigate={onNavigate}
                onChanged={changed}
              />
            ))}
          </ul>
        )
      ) : (
        <FriendList
          friends={tab === "online" ? online : lists.friends}
          emptyTitle={tab === "online" ? t("social.noFriendsOnline") : t("social.noFriends")}
          emptyBody={tab === "online" ? t("social.noFriendsOnlineHint") : t("social.noFriendsHint")}
          onNavigate={onNavigate}
          onChanged={changed}
        />
      )}
    </div>
  );
}

function TabLabel({ text, count, badge = false }: { text: string; count?: number; badge?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {count !== undefined && (
        <span
          className={`min-w-[1.1rem] rounded-full px-1 text-[10px] font-bold leading-4 tabular-nums ${
            badge ? "bg-accent text-white" : "bg-white/10 text-slate-300"
          }`}
        >
          {count}
        </span>
      )}
    </span>
  );
}

function FriendList({
  friends,
  emptyTitle,
  emptyBody,
  onNavigate,
  onChanged,
}: {
  friends: (ProfileCard & { since: string })[];
  emptyTitle: string;
  emptyBody: string;
  onNavigate: (route: SocialRoute) => void;
  onChanged: () => void;
}) {
  const t = useT();
  if (friends.length === 0) {
    return (
      <EmptyState
        icon={<PeopleIcon />}
        title={emptyTitle}
        body={emptyBody}
        action={<SmallButton onClick={() => onNavigate({ view: "friends", tab: "add" })}>{t("social.addFriends")}</SmallButton>}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {friends.map((user) => (
        <PersonRow
          key={user.id}
          user={user}
          detail={
            user.presence?.online || user.presence?.last_seen_at
              ? undefined
              : t("social.friendsSinceWhen", { when: relativeTime(user.since, t) })
          }
          onNavigate={onNavigate}
          onChanged={onChanged}
        />
      ))}
    </ul>
  );
}

function PendingLists({
  lists,
  onNavigate,
  onChanged,
}: {
  lists: FriendLists;
  onNavigate: (route: SocialRoute) => void;
  onChanged: () => void;
}) {
  const t = useT();
  if (lists.incoming.length === 0 && lists.outgoing.length === 0) {
    return <EmptyState icon={<PeopleIcon />} title={t("social.noPending")} body={t("social.noPendingHint")} />;
  }
  return (
    <div className="flex flex-col gap-5">
      {lists.incoming.length > 0 && (
        <section aria-label={t("social.incoming")}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("social.incoming")} · {lists.incoming.length}
          </h3>
          <ul className="flex flex-col gap-2">
            {lists.incoming.map((user) => (
              <PersonRow
                key={user.id}
                user={user}
                detail={t("social.requestedWhen", { when: relativeTime(user.requested_at, t) })}
                onNavigate={onNavigate}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </section>
      )}
      {lists.outgoing.length > 0 && (
        <section aria-label={t("social.outgoing")}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("social.outgoing")} · {lists.outgoing.length}
          </h3>
          <ul className="flex flex-col gap-2">
            {lists.outgoing.map((user) => (
              <PersonRow
                key={user.id}
                user={user}
                detail={t("social.sentWhen", { when: relativeTime(user.requested_at, t) })}
                onNavigate={onNavigate}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A person with the actions that fit: accept/decline, cancel, message, unblock. */
function PersonRow({
  user,
  detail,
  onNavigate,
  onChanged,
}: {
  user: ProfileCard;
  detail?: string;
  onNavigate: (route: SocialRoute) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const notice = useNotice();
  const [relationship, setRelationship] = useState<Relationship>(user.relationship);
  const { busy, run } = useRelationship(user.id, relationship, (next) => {
    setRelationship(next);
    if (next !== relationship) onChanged();
  });
  const open = () => onNavigate({ view: "profile", name: user.username, tab: "overview" });
  const message = async () => {
    try {
      const id = await openConversation(user.id);
      onNavigate({ view: "messages", conversationId: id });
    } catch (e) {
      notice({ tone: "error", text: errorText(e, t("social.actionFailed")) });
    }
  };

  return (
    <UserRow user={{ ...user, relationship }} onOpen={open} detail={detail}>
      {relationship === "incoming" && (
        <>
          <SmallButton tone="accent" onClick={() => void run("accept")} disabled={busy !== null}>
            {t("social.accept")}
          </SmallButton>
          <SmallButton onClick={() => void run("decline")} disabled={busy !== null}>
            {t("social.decline")}
          </SmallButton>
        </>
      )}
      {relationship === "outgoing" && (
        <SmallButton onClick={() => void run("cancel")} disabled={busy !== null}>
          {t("social.cancelRequest")}
        </SmallButton>
      )}
      {relationship === "blocked" && (
        <SmallButton onClick={() => void run("unblock")} disabled={busy !== null}>
          {t("social.unblock")}
        </SmallButton>
      )}
      {relationship === "friends" && (
        <>
          <SmallButton onClick={() => void message()} aria-label={t("social.messageUser", { name: user.username })} title={t("social.message")}>
            <ChatIcon className="h-3.5 w-3.5" />
          </SmallButton>
          <Menu
            label={<DotsIcon />}
            chevron={false}
            aria-label={t("social.moreActions")}
            className="!px-2"
            items={[
              { label: t("social.viewProfile"), onClick: open },
              { separator: true },
              { label: t("social.removeFriend"), onClick: () => void run("remove") },
              { label: t("social.block"), onClick: () => void run("block"), danger: true },
            ]}
          />
        </>
      )}
      {relationship === "none" && (
        <SmallButton onClick={() => void run("add")} disabled={busy !== null}>
          {t("social.addFriend")}
        </SmallButton>
      )}
    </UserRow>
  );
}
