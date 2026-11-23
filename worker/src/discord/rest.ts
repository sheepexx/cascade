import type { WorkerEnv } from "../storage";
import { setting } from "../auth";
import { messageData, type Reply } from "./format";

/**
 * The few Discord API calls the bot makes on its own: roles, the review
 * channel, command registration, and finishing a reply that took too long.
 * The bot token stays in the Worker; nothing here returns or logs it.
 */

const API = "https://discord.com/api/v10";
const TIMEOUT_MS = 8_000;

async function call(
  env: WorkerEnv,
  method: string,
  path: string,
  body?: unknown,
  auth: "bot" | "none" = "bot",
): Promise<Response | null> {
  const token = env.DISCORD_BOT_TOKEN;
  if (auth === "bot" && !token) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(auth === "bot" ? { Authorization: `Bot ${token}` } : {}),
        "Content-Type": "application/json",
        "User-Agent": "DiscordBot (https://cascade.sheepex.net, 1.0)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // One short wait on a rate limit; longer ones are left for next time.
    if (res.status === 429 && attempt === 0) {
      const wait = Number(((await res.json().catch(() => ({}))) as { retry_after?: unknown }).retry_after);
      if (Number.isFinite(wait) && wait > 0 && wait <= 2) {
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        continue;
      }
    }
    return res;
  }
  return null;
}

export type RoleChange = "added" | "removed" | "failed" | "skipped";

/** Gives or takes the configured Contributor role in the configured server. */
export async function setContributorRole(env: WorkerEnv, discordUserId: string, on: boolean): Promise<RoleChange> {
  const guild = setting(env.DISCORD_GUILD_ID);
  const role = setting(env.DISCORD_CONTRIBUTOR_ROLE_ID);
  if (!guild || !role || !env.DISCORD_BOT_TOKEN || !/^\d{1,20}$/.test(discordUserId)) return "skipped";
  const res = await call(
    env,
    on ? "PUT" : "DELETE",
    `/guilds/${guild}/members/${discordUserId}/roles/${role}`,
  ).catch(() => null);
  // 404: they aren't in the server (yet); the next command they run retries.
  if (res?.status === 204) return on ? "added" : "removed";
  return res?.status === 404 ? "skipped" : "failed";
}

/** Posts to a channel and returns the new message's id. */
export async function postMessage(env: WorkerEnv, channelId: string, reply: Reply): Promise<string | null> {
  if (!/^\d{1,20}$/.test(channelId)) return null;
  const res = await call(env, "POST", `/channels/${channelId}/messages`, messageData({ ...reply, ephemeral: false })).catch(
    () => null,
  );
  if (!res?.ok) return null;
  const message = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return typeof message?.id === "string" ? message.id : null;
}

export async function editMessage(env: WorkerEnv, channelId: string, messageId: string, reply: Reply): Promise<boolean> {
  if (!/^\d{1,20}$/.test(channelId) || !/^\d{1,20}$/.test(messageId)) return false;
  const res = await call(env, "PATCH", `/channels/${channelId}/messages/${messageId}`, messageData({ ...reply, ephemeral: false })).catch(
    () => null,
  );
  return res?.ok ?? false;
}

export type ForumTag = { id: string; name: string };

const tagCache = new Map<string, { tags: ForumTag[]; at: number }>();
const TAG_CACHE_MS = 10 * 60_000;

/** A forum channel's tags, kept for a few minutes. */
export async function forumTags(env: WorkerEnv, channelId: string): Promise<ForumTag[]> {
  if (!/^\d{1,20}$/.test(channelId)) return [];
  const cached = tagCache.get(channelId);
  if (cached && Date.now() - cached.at < TAG_CACHE_MS) return cached.tags;
  const res = await call(env, "GET", `/channels/${channelId}`).catch(() => null);
  if (!res?.ok) return [];
  const channel = (await res.json().catch(() => null)) as { available_tags?: unknown } | null;
  const tags = Array.isArray(channel?.available_tags)
    ? channel.available_tags.flatMap((tag: { id?: unknown; name?: unknown }) =>
        typeof tag?.id === "string" && typeof tag.name === "string" ? [{ id: tag.id, name: tag.name }] : [],
      )
    : [];
  tagCache.set(channelId, { tags, at: Date.now() });
  return tags;
}

/** Starts a post in a forum channel; the post is a thread with the message as its start. */
export async function createForumPost(
  env: WorkerEnv,
  channelId: string,
  post: { title: string; message: Reply; tagIds: string[] },
): Promise<{ threadId: string | null; status: number }> {
  if (!/^\d{1,20}$/.test(channelId)) return { threadId: null, status: 0 };
  const { flags: _flags, ...message } = messageData(post.message);
  const res = await call(env, "POST", `/channels/${channelId}/threads`, {
    name: post.title.slice(0, 100),
    applied_tags: post.tagIds.slice(0, 5),
    message,
  }).catch(() => null);
  if (!res?.ok) return { threadId: null, status: res?.status ?? 0 };
  const thread = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return { threadId: typeof thread?.id === "string" ? thread.id : null, status: res.status };
}

/** Replaces the "thinking" placeholder of a deferred reply. */
export async function editOriginal(env: WorkerEnv, interactionToken: string, reply: Reply): Promise<boolean> {
  const app = setting(env.DISCORD_APPLICATION_ID);
  if (!app || !/^[A-Za-z0-9._-]{1,500}$/.test(interactionToken)) return false;
  const { flags: _flags, ...data } = messageData(reply);
  const res = await call(env, "PATCH", `/webhooks/${app}/${interactionToken}/messages/@original`, data, "none").catch(
    () => null,
  );
  return res?.ok ?? false;
}

/** Registers the slash commands: for the server when one is set, otherwise everywhere. */
export async function putCommands(
  env: WorkerEnv,
  commands: unknown[],
): Promise<{ ok: boolean; status: number; scope: "guild" | "global" }> {
  const app = setting(env.DISCORD_APPLICATION_ID);
  const guild = setting(env.DISCORD_GUILD_ID);
  const scope = guild ? "guild" : "global";
  if (!app) return { ok: false, status: 0, scope };
  const path = guild ? `/applications/${app}/guilds/${guild}/commands` : `/applications/${app}/commands`;
  const res = await call(env, "PUT", path, commands).catch(() => null);
  return { ok: res?.ok ?? false, status: res?.status ?? 0, scope };
}
