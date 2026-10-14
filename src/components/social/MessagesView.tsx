import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { INPUT_CLASS } from "../ui/Controls";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth, type AuthUser } from "../../lib/auth";
import { useLocale, useT } from "../../lib/i18n";
import {
  MESSAGE_MAX_LENGTH,
  blockUser,
  deleteMessage,
  editMessage,
  listConversations,
  listFriends,
  listMessages,
  searchUsers,
  markConversationRead,
  openConversation,
  sendMessage,
  setConversationState,
  toggleReaction,
  type Conversation,
  type Message,
  type ProfileCard,
} from "../../lib/social";
import { groupMessages, linkify, mergeMessages } from "../../lib/messageThread";
import { gifInMessage, klipyCustomerId, reportGifShare, type Gif } from "../../lib/klipy";
import type { SocialRoute } from "../../lib/socialRoute";
import { subscribeSupabase } from "../../lib/supabase";
import { Menu } from "../ui/Menu";
import { SkeletonRows } from "../ui/Skeleton";
import {
  AdminBadge,
  Avatar,
  ChatIcon,
  DotsIcon,
  EmptyState,
  ErrorLine,
  PresenceLine,
  SearchIcon,
  SmallButton,
} from "./socialUi";
import { errorText, relativeTime, useDebounced, useNotice } from "./socialUtils";
import { EmojiGifPicker } from "./EmojiGifPicker";

const PAGE = 50;
const TYPING_SEND_MS = 2_500;
const TYPING_SHOW_MS = 5_000;

type Pending = Message & { pending?: boolean; failed?: boolean };

/** A message as a line of text: GIFs read as "GIF" rather than their URL. */
function useMessageText() {
  const t = useT();
  return (body: string) => (gifInMessage(body) ? t("social.gif") : body);
}

/**
 * Private messages: the conversation list on the left, the open conversation
 * on the right (one panel at a time on a phone). New messages arrive over
 * Realtime, which only ever delivers rows from the caller's own
 * conversations (messages_select_member in migration 0041).
 */
export function MessagesView({
  conversationId,
  refreshKey,
  onNavigate,
  onChanged,
}: {
  conversationId: string | null;
  refreshKey: number;
  onNavigate: (route: SocialRoute, replace?: boolean) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const { user: me } = useAuth();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [composing, setComposing] = useState(false);
  const [incoming, setIncoming] = useState<{ message: Message; at: number } | null>(null);
  const reloadTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(() => {
    listConversations()
      .then((rows) => {
        setConversations(rows);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e, t("social.messagesFailed"))));
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const scheduleReload = useCallback(() => {
    window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(reload, 400);
  }, [reload]);

  useEffect(() => () => window.clearTimeout(reloadTimer.current), []);

  useEffect(() => {
    if (!me) return;
    return subscribeSupabase((supabase) =>
      supabase
        .channel(`messages-inbox:${me.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as Message | undefined;
            if (row?.id) setIncoming({ message: row, at: Date.now() });
            scheduleReload();
          },
        )
        .subscribe(),
    );
  }, [me, scheduleReload]);

  const active = conversations?.find((c) => c.id === conversationId) ?? null;

  // A link to a conversation that isn't in the list yet (just opened by the
  // other person) refreshes the list once.
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !conversations || active || askedFor.current === conversationId) return;
    askedFor.current = conversationId;
    reload();
  }, [active, conversationId, conversations, reload]);

  const shown = useMemo(() => {
    const term = filter.trim().toLocaleLowerCase();
    return (conversations ?? []).filter((c) => {
      if (c.id === conversationId) return true;
      if (!c.last_message) return false;
      if (c.archived !== showArchived) return false;
      if (!term) return true;
      return (
        c.user.username.toLocaleLowerCase().includes(term) ||
        (c.last_message.body ?? "").toLocaleLowerCase().includes(term)
      );
    });
  }, [conversations, conversationId, filter, showArchived]);
  const archivedCount = (conversations ?? []).filter((c) => c.archived && c.last_message).length;

  if (!me) return null;

  const updateConversation = (id: string, patch: Partial<Conversation>) =>
    setConversations((prev) => prev?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? prev);

  return (
    <div data-conversation={!!conversationId} className="message-workspace grid h-full min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
      <aside
        className={`min-h-0 flex-col border-white/[0.06] md:flex md:border-r ${conversationId ? "hidden" : "flex"}`}
        aria-label={t("social.conversations")}
      >
        <div className="flex items-center gap-1.5 p-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("social.searchConversations")}</span>
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("social.searchConversations")}
              className={`${INPUT_CLASS} w-full pl-8`}
            />
          </label>
          <SmallButton tone="plain" onClick={() => setComposing(true)} aria-label={t("social.newMessage")} title={t("social.newMessage")}>
            <ChatIcon className="h-3.5 w-3.5" />
          </SmallButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && !conversations ? (
            <ErrorLine message={error} onRetry={reload} />
          ) : !conversations ? (
            <SkeletonRows count={4} avatar action={false} className="p-3" label={t("common.loading")} />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<ChatIcon />}
              title={showArchived ? t("social.noArchived") : filter ? t("social.noConversationMatch") : t("social.noConversations")}
              body={!showArchived && !filter ? t("social.noConversationsHint") : undefined}
            />
          ) : (
            <ul className="flex flex-col gap-px px-1.5 pb-1.5">
              {shown.map((c) => (
                <li key={c.id}>
                  <ConversationItem
                    conversation={c}
                    meId={me.id}
                    active={c.id === conversationId}
                    onSelect={() => onNavigate({ view: "messages", conversationId: c.id }, !!conversationId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        {(archivedCount > 0 || showArchived) && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="border-t border-white/[0.06] px-3.5 py-2.5 text-left text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            {showArchived ? t("social.backToInbox") : t("social.archivedCount", { count: archivedCount })}
          </button>
        )}
      </aside>

      <section className={`relative min-h-0 flex-col md:flex ${conversationId ? "flex" : "hidden"}`}>
        {conversationId && active ? (
          <ConversationPane
            key={active.id}
            conversation={active}
            me={me}
            incoming={incoming}
            onBack={() => onNavigate({ view: "messages", conversationId: null })}
            onNavigate={onNavigate}
            onUpdate={(patch) => updateConversation(active.id, patch)}
            onRead={() => {
              updateConversation(active.id, { unread: 0 });
              onChanged();
            }}
            onSent={scheduleReload}
          />
        ) : conversationId && conversations ? (
          <EmptyState title={t("social.conversationMissing")} action={<SmallButton onClick={() => onNavigate({ view: "messages", conversationId: null }, true)}>{t("common.back")}</SmallButton>} />
        ) : conversationId ? (
          <SkeletonRows count={3} avatar action={false} className="p-4" />
        ) : (
          <EmptyState icon={<ChatIcon />} title={t("social.pickConversation")} body={t("social.pickConversationHint")} />
        )}
      </section>

      {composing && (
        <NewConversation
          onClose={() => setComposing(false)}
          onOpen={(id) => {
            setComposing(false);
            reload();
            onNavigate({ view: "messages", conversationId: id });
          }}
        />
      )}
    </div>
  );
}

function ConversationItem({
  conversation: c,
  meId,
  active,
  onSelect,
}: {
  conversation: Conversation;
  meId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const text = useMessageText();
  const last = c.last_message;
  const preview = !last
    ? t("social.noMessagesYet")
    : last.deleted
      ? t("social.messageDeleted")
      : `${last.sender === meId ? `${t("social.you")}: ` : ""}${text(last.body)}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      data-active={active}
      className={`hit-line-left flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
      }`}
    >
      <Avatar url={c.user.avatar_url} name={c.user.username} presence={c.user.presence} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`truncate text-sm ${c.unread ? "font-semibold text-slate-50" : "font-medium text-slate-200"}`}>
              {c.user.username}
            </span>
            {c.user.is_admin && <AdminBadge compact />}
          </span>
          {last && <span className="shrink-0 text-2xs tabular-nums text-slate-500">{relativeTime(last.created_at, t)}</span>}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`truncate text-xs ${c.unread ? "text-slate-300" : "text-slate-500"}`}>{preview}</span>
          {c.unread > 0 && (
            <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none tabular-nums text-white">
              {c.unread > 99 ? "99+" : c.unread}
            </span>
          )}
          {c.muted && !c.unread && <span className="shrink-0 text-[10px] text-slate-600">{t("social.muted")}</span>}
        </span>
      </span>
    </button>
  );
}

function ConversationPane({
  conversation,
  me,
  incoming,
  onBack,
  onNavigate,
  onUpdate,
  onRead,
  onSent,
}: {
  conversation: Conversation;
  me: AuthUser;
  incoming: { message: Message; at: number } | null;
  onBack: () => void;
  onNavigate: (route: SocialRoute) => void;
  onUpdate: (patch: Partial<Conversation>) => void;
  onRead: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const notice = useNotice();
  const other = conversation.user;
  const [messages, setMessages] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [typing, setTyping] = useState(false);
  /** The message whose reaction picker is open, and where to put the picker. */
  const [reacting, setReacting] = useState<{ id: string; top: number; left: number } | null>(null);
  const text = useMessageText();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<number | undefined>(undefined);
  const sendsInFlight = useRef(new Set<string>());
  const deferredOwnMessages = useRef(new Map<string, Message>());

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void markConversationRead(conversation.id).then(onRead).catch(() => {});
  }, [conversation.id, onRead]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listMessages(conversation.id, null, PAGE)
      .then((rows) => {
        if (cancelled) return;
        setMessages(mergeMessages([], rows));
        setHasOlder(rows.length === PAGE);
        stickToBottom.current = true;
        markRead();
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(errorText(e, t("social.messagesFailed")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // markRead is stable per conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, t]);

  useEffect(() => {
    if (!incoming || incoming.message.conversation_id !== conversation.id) return;
    // Realtime may beat the send response. Keep our echoes until that
    // response replaces the temporary row with its server id; merging
    // them sooner would show both copies. Other people's messages stay live.
    if (incoming.message.sender === me.id && sendsInFlight.current.size > 0) {
      deferredOwnMessages.current.set(incoming.message.id, incoming.message);
      return;
    }
    const el = scrollRef.current;
    stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setMessages((prev) => mergeMessages(prev, [incoming.message]));
    if (incoming.message.sender !== me.id) {
      setTyping(false);
      markRead();
    }
  }, [incoming, conversation.id, me.id, markRead]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && conversation.unread > 0) markRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversation.unread, markRead]);

  // Typing indicators ride a private channel only the two members may join.
  useEffect(() => {
    const unsubscribe = subscribeSupabase((supabase) => {
      const ch = supabase.channel(`dm:${conversation.id}`, {
        config: { private: true, broadcast: { self: false } },
      });
      ch.on("broadcast", { event: "typing" }, ({ payload }) => {
        if ((payload as { user?: string })?.user !== other.id) return;
        setTyping(true);
        window.clearTimeout(typingTimer.current);
        typingTimer.current = window.setTimeout(() => setTyping(false), TYPING_SHOW_MS);
      });
      channelRef.current = ch;
      return ch.subscribe();
    });
    return () => {
      window.clearTimeout(typingTimer.current);
      channelRef.current = null;
      unsubscribe();
    };
  }, [conversation.id, other.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing]);

  const loadOlder = () => {
    if (loadingOlder || !hasOlder || !messages.length) return;
    const el = scrollRef.current;
    setLoadingOlder(true);
    listMessages(conversation.id, messages[0].created_at, PAGE)
      .then((rows) => {
        if (el) restoreFrom.current = el.scrollHeight - el.scrollTop;
        stickToBottom.current = false;
        setMessages((prev) => mergeMessages(prev, rows));
        setHasOlder(rows.length === PAGE);
      })
      .catch(() => notice({ tone: "error", text: t("social.messagesFailed") }))
      .finally(() => setLoadingOlder(false));
  };

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_SEND_MS) return;
    lastTypingSent.current = now;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { user: me.id } });
  };

  /** Sends the draft, or `gifUrl` in its place (the draft stays). */
  const submit = async (gifUrl?: string) => {
    const body = (gifUrl ?? draft).trim();
    if (!body || body.length > MESSAGE_MAX_LENGTH) return;
    if (editing && !gifUrl) {
      const target = editing;
      setEditing(null);
      setDraft("");
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, body, edited_at: new Date().toISOString() } : m)));
      try {
        const saved = await editMessage(target.id, body);
        setMessages((prev) => mergeMessages(prev, [saved]));
      } catch (e) {
        setMessages((prev) => prev.map((m) => (m.id === target.id ? target : m)));
        notice({ tone: "error", text: errorText(e, t("social.actionFailed")) });
      }
      return;
    }
    const tempId = `pending-${crypto.randomUUID()}`;
    const optimistic: Pending = {
      id: tempId,
      conversation_id: conversation.id,
      sender: me.id,
      body,
      reply_to: replyTo?.id ?? null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      pending: true,
    };
    sendsInFlight.current.add(tempId);
    stickToBottom.current = true;
    setMessages((prev) => [...prev, optimistic]);
    if (!gifUrl) setDraft("");
    setReplyTo(null);
    try {
      const saved = await sendMessage(conversation.id, body, optimistic.reply_to);
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== tempId), [saved]));
      onSent();
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      notice({ tone: "error", text: errorText(e, t("social.sendFailed")) });
    } finally {
      sendsInFlight.current.delete(tempId);
      if (sendsInFlight.current.size === 0 && deferredOwnMessages.current.size > 0) {
        const echoes = [...deferredOwnMessages.current.values()];
        deferredOwnMessages.current.clear();
        setMessages((prev) => mergeMessages(prev, echoes));
      }
    }
  };

  const sendGif = (gif: Gif, query: string) => {
    void submit(gif.full.url);
    void klipyCustomerId(me.id).then((id) => reportGifShare(gif.slug, id, query)).catch(() => {});
    inputRef.current?.focus();
  };

  const react = async (message: Message, emoji: string) => {
    const before = message.reactions ?? {};
    const users = before[emoji] ?? [];
    const users2 = users.includes(me.id) ? users.filter((u) => u !== me.id) : [...users, me.id];
    const next = { ...before };
    if (users2.length) next[emoji] = users2;
    else delete next[emoji];
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, reactions: next } : m)));
    try {
      const saved = await toggleReaction(message.id, emoji);
      setMessages((prev) => mergeMessages(prev, [saved]));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, reactions: before } : m)));
      notice({ tone: "error", text: errorText(e, t("social.actionFailed")) });
    }
  };

  /** Opens the reaction picker next to the button that asked for it, inside the pane. */
  const openReactions = (message: Message, button: HTMLElement) => {
    const pane = button.closest("section");
    if (!pane) return;
    const box = pane.getBoundingClientRect();
    const at = button.getBoundingClientRect();
    const width = Math.min(352, box.width - 16);
    const height = 352;
    const left = Math.max(8, Math.min(at.left - box.left - width / 2, box.width - width - 8));
    const below = at.bottom - box.top + 4;
    const top = below + height <= box.height - 8 ? below : Math.max(8, at.top - box.top - height - 4);
    setReacting({ id: message.id, top, left });
  };

  const remove = async (message: Message) => {
    if (!window.confirm(t("social.deleteMessageConfirm"))) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, body: "", deleted_at: new Date().toISOString() } : m)));
    try {
      await deleteMessage(message.id);
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      notice({ tone: "error", text: errorText(e, t("social.actionFailed")) });
    }
  };

  const setState = async (patch: { muted?: boolean; archived?: boolean }) => {
    onUpdate(patch);
    try {
      await setConversationState(conversation.id, patch);
    } catch (e) {
      onUpdate({ muted: conversation.muted, archived: conversation.archived });
      notice({ tone: "error", text: errorText(e, t("social.actionFailed")) });
    }
  };

  const groups = useMemo(() => groupMessages(messages, locale), [messages, locale]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const openProfile = () => onNavigate({ view: "profile", name: other.username, tab: "overview" });

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
        <button
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-200 md:hidden"
          aria-label={t("common.back")}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <button type="button" onClick={openProfile} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
          <Avatar url={other.avatar_url} name={other.username} size="sm" presence={other.presence} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-display text-[0.9375rem] font-semibold text-slate-50">{other.username}</span>
              {other.is_admin && <AdminBadge compact />}
            </span>
            <PresenceLine presence={other.presence} className="text-[11px] text-slate-500" />
          </span>
        </button>
        {conversation.muted && <span className="hidden text-[11px] text-slate-500 sm:inline">{t("social.muted")}</span>}
        <Menu
          label={<DotsIcon />}
          chevron={false}
          aria-label={t("social.conversationActions")}
          className="!px-2"
          items={[
            { label: t("social.viewProfile"), onClick: openProfile },
            { label: conversation.muted ? t("social.unmute") : t("social.mute"), onClick: () => void setState({ muted: !conversation.muted }) },
            {
              label: conversation.archived ? t("social.unarchive") : t("social.archive"),
              onClick: () => void setState({ archived: !conversation.archived }),
            },
            { separator: true },
            {
              label: t("social.block"),
              danger: true,
              onClick: () =>
                void blockUser(other.id)
                  .then(() => {
                    onUpdate({ can_send: false, user: { ...other, relationship: "blocked" } });
                    notice({ tone: "info", text: t("social.blocked") });
                  })
                  .catch((e: unknown) => notice({ tone: "error", text: errorText(e, t("social.actionFailed")) })),
            },
          ]}
        />
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (el.scrollTop < 60) loadOlder();
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-label={t("social.messagesWith", { name: other.username })}
      >
        {loading ? (
          <SkeletonRows count={3} avatar action={false} label={t("common.loading")} />
        ) : loadError ? (
          <ErrorLine message={loadError} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<Avatar url={other.avatar_url} name={other.username} size="lg" />}
            title={t("social.startConversation", { name: other.username })}
            body={t("social.startConversationHint")}
          />
        ) : (
          <>
            {hasOlder && (
              <div className="flex justify-center pb-2">
                <SmallButton onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? t("common.loading") : t("social.loadOlder")}
                </SmallButton>
              </div>
            )}
            {groups.map((day) => (
              <Fragment key={day.key}>
                <div className="my-4 flex items-center gap-3 text-2xs font-medium text-slate-500">
                  <span className="h-px flex-1 bg-white/[0.06]" />
                  {day.label}
                  <span className="h-px flex-1 bg-white/[0.06]" />
                </div>
                {day.runs.map((run) => {
                  const mine = run.sender === me.id;
                  const author = mine ? me : other;
                  return (
                    <div key={run.messages[0].id} className={`mb-3 flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                      <button
                        type="button"
                        onClick={() => onNavigate({ view: "profile", name: author.username, tab: "overview" })}
                        className="mt-0.5 h-fit shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                        aria-label={t("social.viewProfileOf", { name: author.username })}
                      >
                        <Avatar url={author.avatar_url} name={author.username} size="sm" />
                      </button>
                      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}>
                        <div className={`flex items-baseline gap-2 px-1 ${mine ? "flex-row-reverse" : ""}`}>
                          <span className="font-display text-[0.8125rem] font-semibold text-slate-100">{author.username}</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(run.messages[0].created_at).toLocaleTimeString(locale, {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      {run.messages.map((m) => (
                        <MessageBubble
                          key={m.id}
                          message={m as Pending}
                          mine={mine}
                          replied={m.reply_to ? byId.get(m.reply_to) ?? null : null}
                          otherName={other.username}
                          meId={me.id}
                          canReact={conversation.can_send}
                          onReact={(emoji) => void react(m, emoji)}
                          onMoreReactions={(button) => openReactions(m, button)}
                          onMediaLoad={() => {
                            const el = scrollRef.current;
                            if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
                          }}
                          onReply={() => {
                            setEditing(null);
                            setReplyTo(m);
                            inputRef.current?.focus();
                          }}
                          onEdit={() => {
                            setReplyTo(null);
                            setEditing(m);
                            setDraft(m.body);
                            inputRef.current?.focus();
                          }}
                          onDelete={() => void remove(m)}
                          onRetry={() => {
                            setMessages((prev) => prev.filter((x) => x.id !== m.id));
                            setDraft(m.body);
                            inputRef.current?.focus();
                          }}
                        />
                      ))}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </>
        )}
        {typing && (
          <p className="flex items-center gap-1.5 px-1 pt-1 text-[11px] text-slate-500">
            <span className="flex gap-0.5" aria-hidden>
              <span className="h-1 w-1 animate-pulse rounded-full bg-slate-500" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-slate-500 [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-slate-500 [animation-delay:300ms]" />
            </span>
            {t("social.typing", { name: other.username })}
          </p>
        )}
      </div>

      {conversation.can_send ? (
        <Composer
          inputRef={inputRef}
          draft={draft}
          onDraft={(value) => {
            setDraft(value);
            if (value) sendTyping();
          }}
          onSubmit={() => void submit()}
          userId={me.id}
          onGif={sendGif}
          banner={
            replyTo ? (
              <ComposerBanner
                label={t("social.replyingTo", { name: replyTo.sender === me.id ? t("social.yourself") : other.username })}
                text={replyTo.deleted_at ? t("social.messageDeleted") : text(replyTo.body)}
                onCancel={() => setReplyTo(null)}
              />
            ) : editing ? (
              <ComposerBanner
                label={t("social.editingMessage")}
                text={editing.body}
                onCancel={() => {
                  setEditing(null);
                  setDraft("");
                }}
              />
            ) : null
          }
          onCancel={() => {
            if (editing) setDraft("");
            setEditing(null);
            setReplyTo(null);
          }}
          placeholder={t("social.messagePlaceholder", { name: other.username })}
        />
      ) : (
        <p className="border-t border-white/[0.07] px-4 py-3 text-center text-xs text-slate-500">
          {t("social.cantReply")}
        </p>
      )}

      {reacting && (
        <div className="absolute z-30" style={{ top: reacting.top, left: reacting.left }}>
          <EmojiGifPicker
            userId={me.id}
            gifs={false}
            onEmoji={(emoji) => {
              const target = messages.find((m) => m.id === reacting.id);
              setReacting(null);
              if (target) void react(target, emoji);
            }}
            onClose={() => setReacting(null)}
          />
        </div>
      )}
    </>
  );
}

function MessageBubble({
  message,
  mine,
  replied,
  otherName,
  meId,
  canReact,
  onReact,
  onMoreReactions,
  onMediaLoad,
  onReply,
  onEdit,
  onDelete,
  onRetry,
}: {
  message: Pending;
  mine: boolean;
  replied: Message | null;
  otherName: string;
  meId: string;
  canReact: boolean;
  onReact: (emoji: string) => void;
  onMoreReactions: (button: HTMLElement) => void;
  onMediaLoad: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  const text = useMessageText();
  const deleted = !!message.deleted_at;
  const gif = deleted ? null : gifInMessage(message.body);
  const [gifFailed, setGifFailed] = useState(false);
  const reactions = Object.entries(message.reactions ?? {}).filter(([, users]) => users.length > 0);
  const live = !deleted && !message.pending && !message.failed;
  return (
    <div className={`flex max-w-[85%] flex-col gap-1 sm:max-w-[72%] ${mine ? "items-end" : "items-start"}`}>
    <div className={`group flex max-w-full items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
      <div
        className={`min-w-0 text-sm leading-relaxed ${
          gif && !gifFailed && !replied
            ? ""
            : `rounded-xl px-3 py-1.5 ${
                deleted
                  ? "border border-dashed border-white/10 italic text-slate-500"
                  : mine
                    ? "bg-accent/[0.22] text-slate-50 ring-1 ring-inset ring-accent/30"
                    : "bg-white/[0.06] text-slate-100"
              }`
        } ${message.pending ? "opacity-60" : ""} ${message.failed ? "rounded-2xl ring-1 ring-rose-400/70" : ""}`}
      >
        {replied && !deleted && (
          <div className={`mb-1 border-l-2 pl-2 text-xs ${mine ? "border-accent/60 text-slate-300" : "border-slate-400/50 text-slate-400"}`}>
            <span className="font-medium">{replied.sender === meId ? t("social.you") : otherName}</span>
            <span className="line-clamp-2 break-words">{replied.deleted_at ? t("social.messageDeleted") : text(replied.body)}</span>
          </div>
        )}
        {deleted ? (
          t("social.messageDeleted")
        ) : gif && !gifFailed ? (
          <img
            src={gif}
            alt={t("social.gif")}
            draggable={false}
            onLoad={onMediaLoad}
            onError={() => setGifFailed(true)}
            className="block max-h-60 max-w-full rounded-xl bg-ink-700/60 sm:max-w-[18rem]"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {linkify(message.body).map((part, i) =>
              part.href ? (
                <a
                  key={i}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
                >
                  {part.text}
                </a>
              ) : (
                <Fragment key={i}>{part.text}</Fragment>
              ),
            )}
            {message.edited_at && <span className="ml-1.5 text-[10px] text-slate-500">{t("social.edited")}</span>}
          </p>
        )}
      </div>
      {message.failed ? (
        <button type="button" onClick={onRetry} className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/10">
          {t("social.notSentRetry")}
        </button>
      ) : (
        !deleted &&
        !message.pending && (
          <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            {canReact && (
              <BubbleAction label={t("social.addReaction")} onClick={(e) => onMoreReactions(e.currentTarget)}>
                <circle cx="12" cy="12" r="8.5" />
                <path strokeLinecap="round" d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9.5 9.75h.01M14.5 9.75h.01" />
              </BubbleAction>
            )}
            <BubbleAction label={t("social.reply")} onClick={onReply}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 8 4 12l5 4M4 12h10a6 6 0 0 1 6 6" />
            </BubbleAction>
            {mine && !gif && (
              <BubbleAction label={t("common.edit")} onClick={onEdit}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15 5 4 4L9 19H5v-4L15 5Z" />
              </BubbleAction>
            )}
            {mine && (
              <BubbleAction label={t("common.delete")} onClick={onDelete}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
              </BubbleAction>
            )}
          </div>
        )
      )}
    </div>
      {live && reactions.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
          {reactions.map(([emoji, users]) => {
            const reacted = users.includes(meId);
            const names = users.map((u) => (u === meId ? t("social.you") : otherName)).join(", ");
            return (
              <button
                key={emoji}
                type="button"
                disabled={!canReact}
                onClick={() => onReact(emoji)}
                aria-pressed={reacted}
                aria-label={t("social.reactedWith", { names, emoji })}
                title={t("social.reactedWith", { names, emoji })}
                className={`flex h-6 items-center gap-1 rounded-full px-2 text-xs tabular-nums ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default ${
                  reacted
                    ? "bg-accent/15 text-slate-100 ring-accent/50"
                    : "bg-white/[0.04] text-slate-300 ring-white/[0.08] enabled:hover:ring-white/20"
                }`}
              >
                <span className="text-sm leading-none">{emoji}</span>
                <span>{users.length}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BubbleAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function ComposerBanner({ label, text, onCancel }: { label: string; text: string; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-300">{label}</div>
        <div className="truncate text-slate-500">{text}</div>
      </div>
      <button type="button" onClick={onCancel} className="rounded px-1 text-slate-500 hover:text-slate-200" aria-label={t("common.cancel")}>
        ×
      </button>
    </div>
  );
}

function Composer({
  inputRef,
  draft,
  onDraft,
  onSubmit,
  onCancel,
  banner,
  placeholder,
  userId,
  onGif,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  banner: ReactNode;
  placeholder: string;
  userId: string;
  onGif: (gif: Gif, query: string) => void;
}) {
  const t = useT();
  const over = draft.length > MESSAGE_MAX_LENGTH;
  const [picking, setPicking] = useState(false);
  const closePicker = () => setPicking(false);
  /** Where the caret was when the picker took focus, for putting emoji there. */
  const caret = useRef<{ start: number; end: number } | null>(null);

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const at = caret.current ?? { start: draft.length, end: draft.length };
    const next = draft.slice(0, at.start) + emoji + draft.slice(at.end);
    if (next.length > MESSAGE_MAX_LENGTH) return;
    const position = at.start + emoji.length;
    caret.current = { start: position, end: position };
    onDraft(next);
    requestAnimationFrame(() => el?.setSelectionRange(position, position));
  };

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, inputRef]);

  return (
    <form
      className="relative border-t border-white/[0.06] px-4 py-3 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {picking && (
        <EmojiGifPicker
          userId={userId}
          onEmoji={insertEmoji}
          onGif={(gif, query) => {
            setPicking(false);
            onGif(gif, query);
          }}
          onClose={closePicker}
          className="absolute bottom-full right-3 z-30 mb-2"
        />
      )}
      {banner}
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{placeholder}</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSubmit();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                onCancel();
              }
            }}
            className={`${INPUT_CLASS} block max-h-40 w-full resize-none px-3 py-2 leading-relaxed`}
          />
        </label>
        <button
          type="button"
          onPointerDown={() => {
            const el = inputRef.current;
            caret.current = el ? { start: el.selectionStart, end: el.selectionEnd } : null;
          }}
          onClick={() => setPicking((open) => !open)}
          data-picker-toggle
          aria-label={t("social.emojiAndGifs")}
          title={t("social.emojiAndGifs")}
          aria-expanded={picking}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            picking ? "bg-white/[0.1] text-slate-100" : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <circle cx="12" cy="12" r="8.5" />
            <path strokeLinecap="round" d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9.5 9.75h.01M14.5 9.75h.01" />
          </svg>
        </button>
        <button
          type="submit"
          disabled={!draft.trim() || over}
          aria-label={t("social.send")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-white transition hover:bg-[#ee7676] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-500"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      {draft.length > MESSAGE_MAX_LENGTH - 200 && (
        <p className={`mt-1 text-right text-[10px] tabular-nums ${over ? "text-rose-300" : "text-slate-500"}`}>
          {draft.length}/{MESSAGE_MAX_LENGTH}
        </p>
      )}
    </form>
  );
}

/** Picks a friend to start a conversation with. */
function NewConversation({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const t = useT();
  const notice = useNotice();
  const [friends, setFriends] = useState<ProfileCard[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const query = useDebounced(filter.trim(), 250);
  const [found, setFound] = useState<ProfileCard[] | null>(null);

  useEffect(() => {
    listFriends()
      .then((lists) => setFriends(lists.friends))
      .catch(() => setFriends([]));
  }, []);

  // Friends while the box is empty; anyone on Cascade once something is typed.
  useEffect(() => {
    if (!query) {
      setFound(null);
      return;
    }
    let cancelled = false;
    setFound(null);
    searchUsers(query, 20, 0)
      .then((page) => {
        if (!cancelled) setFound(page.users.filter((u) => u.relationship !== "self"));
      })
      .catch(() => {
        if (!cancelled) setFound([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const shown = query ? found : friends;

  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center bg-[rgb(5_5_8/0.6)] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div role="dialog" aria-label={t("social.newMessage")} className="modal-panel-in flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-ink-700 shadow-[var(--shadow-float)] ring-1 ring-white/[0.09]">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-display text-[0.9375rem] font-semibold text-slate-50">{t("social.newMessage")}</h3>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 text-slate-400 hover:text-slate-200" aria-label={t("common.close")}>
            ×
          </button>
        </div>
        <div className="p-3">
          <input
            type="search"
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("social.searchAnyone")}
            className={`${INPUT_CLASS} w-full`}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!shown ? (
            <SkeletonRows count={3} avatar action={false} />
          ) : shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              {query ? t("social.noResults", { query }) : t("social.typeToFindAnyone")}
            </p>
          ) : (
            <ul>
              {shown.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy(f.id);
                      openConversation(f.id)
                        .then(onOpen)
                        .catch((e: unknown) => notice({ tone: "error", text: errorText(e, t("social.actionFailed")) }))
                        .finally(() => setBusy(null));
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    <Avatar url={f.avatar_url} name={f.username} size="sm" presence={f.presence} />
                    <span className="truncate text-sm text-slate-200">{f.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
