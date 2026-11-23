import type { WorkerEnv } from "../storage";
import { discordReady, fetchSessionUser, setting, verifySession } from "../auth";
import { bearerToken, json } from "../http";
import { COMMANDS, LEADERBOARDS, type LeaderboardMetric } from "./commands";
import {
  data as botData,
  type BotData,
  type Contribution,
  type ContributorStatus,
  type DiscordAccount,
  type PublicProfile,
  type PublicStats,
} from "./data";
import {
  COLORS,
  EPHEMERAL,
  clip,
  count,
  duration,
  embed,
  httpsUrl,
  linkButton,
  messageData,
  notice,
  plain,
  when,
  type ActionRow,
  type Embed,
  type Reply,
} from "./format";
import * as discordRest from "./rest";
import { verifyInteraction } from "./verify";

/**
 * The official Cascade bot, answering Discord's HTTP interactions inside the
 * Worker: no gateway connection, no process to keep alive. Discord posts each
 * slash command, button press and form to /discord/interactions, signed with
 * the application's key; the reply goes back in the response, or, when the
 * database is slow, as a "thinking" placeholder filled in afterwards.
 *
 * Everyone is treated as a signed-out visitor of the website: profiles and
 * statistics come from the public functions, so privacy settings hold here
 * too. Looking someone up by their Discord account needs their permission;
 * their Cascade name works as it does on the website.
 */

const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const MODAL_SUBMIT = 5;

const CHANNEL_MESSAGE = 4;
const DEFERRED_MESSAGE = 5;
const DEFERRED_UPDATE = 6;
const UPDATE_MESSAGE = 7;
const MODAL = 9;

/** Discord allows three seconds; anything slower than this is finished later. */
const DEADLINE_MS = 2_200;
const ADMINISTRATOR = 1n << 3n;

type DiscordUser = { id: string; username?: string; global_name?: string | null };

type Option = { name: string; type: number; value?: unknown; options?: Option[] };

export type Interaction = {
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: DiscordUser; roles?: string[]; permissions?: string };
  user?: DiscordUser;
  data?: {
    name?: string;
    custom_id?: string;
    options?: Option[];
    resolved?: { users?: Record<string, DiscordUser> };
    components?: unknown[];
  };
};

export type InteractionResponse = { type: number; data?: Record<string, unknown> };

export type BotDeps = {
  data: BotData;
  rest: Pick<
    typeof discordRest,
    "setContributorRole" | "postMessage" | "editMessage" | "editOriginal" | "putCommands" | "forumTags" | "createForumPost"
  >;
};

const DEFAULT_DEPS: BotDeps = { data: botData, rest: discordRest };

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event: `discord.${event}`, ...fields }));
}

function profileUrl(env: WorkerEnv, handle: string): string {
  return `${env.FRONTEND_URL}/user/${encodeURIComponent(handle)}`;
}

function invokerOf(interaction: Interaction): DiscordUser | null {
  const user = interaction.member?.user ?? interaction.user;
  return user && /^\d{1,20}$/.test(user.id) ? user : null;
}

function displayName(user: DiscordUser): string {
  return (user.global_name || user.username || "someone").slice(0, 64);
}

/** The options of the command, or of its subcommand. */
function optionsOf(interaction: Interaction): { sub: string | null; options: Option[] } {
  const top = interaction.data?.options ?? [];
  const sub = top.find((o) => o.type === 1);
  return sub ? { sub: sub.name, options: sub.options ?? [] } : { sub: null, options: top };
}

function optString(options: Option[], name: string): string | null {
  const value = options.find((o) => o.name === name)?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optInt(options: Option[], name: string): number | null {
  const value = options.find((o) => o.name === name)?.value;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function message(reply: Reply): InteractionResponse {
  return { type: CHANNEL_MESSAGE, data: messageData(reply) };
}

function update(reply: Reply): InteractionResponse {
  const { flags: _flags, ...rest } = messageData(reply);
  return { type: UPDATE_MESSAGE, data: rest };
}

function failure(): Reply {
  return notice("Something went wrong on Cascade's side. Try again in a moment.", COLORS.danger);
}

/**
 * Runs `work` and answers with it, or, if it isn't done in time, answers
 * with Discord's placeholder and edits the reply in once it is.
 */
async function answer(
  work: () => Promise<Reply>,
  interaction: Interaction,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps,
  opts: { update?: boolean; ephemeral: boolean; name: string },
): Promise<InteractionResponse> {
  const started = Date.now();
  const task = work().catch((error: unknown) => {
    log("error", { command: opts.name, message: error instanceof Error ? error.message : "unknown" });
    return failure();
  });
  const wrap = (reply: Reply) => (opts.update ? update(reply) : message(reply));
  if (!ctx) return wrap(await task);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), DEADLINE_MS);
  });
  const first = await Promise.race([task, late]);
  if (timer !== undefined) clearTimeout(timer);
  if (first !== "late") {
    log("reply", { command: opts.name, ms: Date.now() - started });
    return wrap(first);
  }
  ctx.waitUntil(
    task.then(async (reply) => {
      const ok = await deps.rest.editOriginal(env, interaction.token, reply);
      log("late_reply", { command: opts.name, ms: Date.now() - started, ok });
    }),
  );
  return opts.update
    ? { type: DEFERRED_UPDATE }
    : { type: DEFERRED_MESSAGE, data: { flags: opts.ephemeral ? EPHEMERAL : 0 } };
}

function later(ctx: ExecutionContext | undefined, work: Promise<unknown>): Promise<void> | void {
  const settled = work.then(
    () => {},
    () => {},
  );
  if (ctx) ctx.waitUntil(settled);
  else return settled;
}

// ---------------------------------------------------------------------------
// Who is asking
// ---------------------------------------------------------------------------

/**
 * Server administrators, the Discord ids listed in DISCORD_MAINTAINER_IDS, and
 * Discord accounts linked to a Cascade admin; only inside the Cascade server.
 */
export async function isMaintainer(interaction: Interaction, env: WorkerEnv, deps: BotDeps): Promise<boolean> {
  const user = invokerOf(interaction);
  if (!user || !interaction.guild_id) return false;
  const guild = setting(env.DISCORD_GUILD_ID);
  if (guild && interaction.guild_id !== guild) return false;
  const listed = setting(env.DISCORD_MAINTAINER_IDS).split(/[\s,]+/).filter(Boolean);
  if (listed.includes(user.id)) return true;
  // Administrator only counts in the Cascade server itself; without one
  // configured, any server the bot was added to would do.
  const permissions = interaction.member?.permissions ?? "";
  if (guild && /^\d{1,30}$/.test(permissions) && (BigInt(permissions) & ADMINISTRATOR) !== 0n) return true;
  const account = await deps.data.discordAccount(env, user.id).catch(() => null);
  return account?.is_admin === true;
}

/** Gives the Contributor role to someone who has earned it (or, when allowed, takes it). */
export async function syncContributorRole(
  env: WorkerEnv,
  discordUserId: string,
  opts: { allowRemove?: boolean } = {},
  deps: BotDeps = DEFAULT_DEPS,
): Promise<discordRest.RoleChange> {
  if (!setting(env.DISCORD_GUILD_ID) || !setting(env.DISCORD_CONTRIBUTOR_ROLE_ID) || !env.DISCORD_BOT_TOKEN) {
    return "skipped";
  }
  const owner = await deps.data.identityOwner(env, discordUserId).catch(() => null);
  const status = await deps.data.contributor(env, owner ?? null, discordUserId);
  if (status.contributor) return deps.rest.setContributorRole(env, discordUserId, true);
  if (opts.allowRemove) return deps.rest.setContributorRole(env, discordUserId, false);
  return "skipped";
}

/** The role, given now if they have earned it but don't have it yet. */
function catchUpRole(
  interaction: Interaction,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  status: ContributorStatus,
  deps: BotDeps,
): void {
  const role = setting(env.DISCORD_CONTRIBUTOR_ROLE_ID);
  const user = invokerOf(interaction);
  if (!role || !user || !status.contributor || interaction.member?.roles?.includes(role)) return;
  if (setting(env.DISCORD_GUILD_ID) !== interaction.guild_id) return;
  void later(ctx, deps.rest.setContributorRole(env, user.id, true));
}

function linkPrompt(env: WorkerEnv): Reply {
  if (!discordReady(env)) {
    return notice("Connecting Discord to Cascade isn't switched on yet.");
  }
  return {
    embeds: [
      embed({
        title: "Connect your Cascade account",
        description:
          "Open Cascade, sign in, and confirm with Discord. It takes a few seconds, and Cascade never asks you for a code or password here.",
        color: COLORS.accent,
      }),
    ],
    components: [linkButton("Connect on Cascade", `${env.FRONTEND_URL}/?connect=discord`)],
    ephemeral: true,
  };
}

type Target = { name: string; self: boolean; discordId: string | null; account: DiscordAccount | null };

/**
 * Whose profile: a Cascade name, a member who lets others look them up, or
 * the person asking. A member who hasn't linked and one who keeps it private
 * get the same answer, so the bot never tells which.
 */
async function target(interaction: Interaction, env: WorkerEnv, deps: BotDeps): Promise<Target | Reply> {
  const user = invokerOf(interaction);
  if (!user) return failure();
  const { options } = optionsOf(interaction);
  const name = optString(options, "name");
  const member = optString(options, "user");
  if (name) return { name: name.slice(0, 64), self: false, discordId: null, account: null };
  if (member && member !== user.id) {
    const account = await deps.data.discordAccount(env, member);
    if (!account || account.discord_lookup !== "everyone") {
      return notice("That member doesn't show a Cascade profile on Discord. You can still look someone up by their Cascade name.");
    }
    return { name: account.handle, self: false, discordId: member, account };
  }
  const account = await deps.data.discordAccount(env, user.id);
  if (!account) return linkPrompt(env);
  return { name: account.handle, self: true, discordId: user.id, account };
}

function isReply(value: unknown): value is Reply {
  return !!value && typeof value === "object" && !("name" in value && "self" in value);
}

function badges(profile: PublicProfile): string {
  return [profile.is_admin ? "Cascade admin" : null, profile.is_contributor ? "Contributor" : null]
    .filter(Boolean)
    .join(" · ");
}

function statFields(stats: PublicStats | null): Embed["fields"] {
  const fields: NonNullable<Embed["fields"]> = [];
  if (stats?.totals) {
    const total = stats.totals.edit + stats.totals.playtest + stats.totals.review;
    fields.push({ name: "Mapping time", value: duration(total), inline: true });
  }
  if (stats?.counters) {
    fields.push(
      { name: "Notes placed", value: count(stats.counters.notes_placed), inline: true },
      { name: "Maps edited", value: count(stats.counters.maps_edited), inline: true },
    );
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function profileCommand(interaction: Interaction, env: WorkerEnv, deps: BotDeps): Promise<Reply> {
  const who = await target(interaction, env, deps);
  if (isReply(who)) return who;
  const profile = await deps.data.profile(env, who.name);
  if (!profile) return notice(`Nobody on Cascade is called ${plain(who.name)}.`);
  const stats = await deps.data.stats(env, profile.id).catch(() => null);
  const handle = profile.handle ?? profile.username;
  const fields: NonNullable<Embed["fields"]> = [
    { name: "Joined Cascade", value: when(profile.cascade_joined_at) ?? "", inline: true },
  ];
  if (profile.osu_id) {
    const ranked = profile.osu ? ` · ${count(profile.osu.ranked_count)} ranked` : "";
    fields.push({ name: "osu!", value: `[Profile](https://osu.ppy.sh/users/${profile.osu_id})${ranked}`, inline: true });
  }
  fields.push(...(statFields(stats) ?? []));
  const hidden = !stats?.visible.mapping_stats || !stats.visible.mapping_time;
  return {
    embeds: [
      embed({
        title: profile.username,
        url: profileUrl(env, handle),
        description: badges(profile) || undefined,
        color: COLORS.accent,
        thumbnail: httpsUrl(profile.avatar_url) ? { url: profile.avatar_url! } : undefined,
        fields,
        footer: hidden ? { text: "Some numbers are hidden by this profile's privacy settings." } : undefined,
      }),
    ],
    components: [linkButton("Open profile", profileUrl(env, handle))],
  };
}

async function statsCommand(interaction: Interaction, env: WorkerEnv, deps: BotDeps): Promise<Reply> {
  const who = await target(interaction, env, deps);
  if (isReply(who)) return who;
  const profile = await deps.data.profile(env, who.name);
  if (!profile) return notice(`Nobody on Cascade is called ${plain(who.name)}.`);
  const stats = await deps.data.stats(env, profile.id);
  if (!stats?.counters && !stats?.totals) {
    return notice(
      who.self
        ? "Your mapping statistics are private. Show them to everyone in Cascade's Social & privacy settings to share them here."
        : `${plain(profile.username)} keeps their mapping statistics private.`,
    );
  }
  const fields: NonNullable<Embed["fields"]> = [];
  if (stats.totals) {
    const t = stats.totals;
    fields.push(
      { name: "Mapping time", value: duration(t.edit + t.playtest + t.review), inline: true },
      { name: "Editing", value: duration(t.edit), inline: true },
      { name: "Playtesting", value: duration(t.playtest), inline: true },
      { name: "Longest session", value: duration(t.longest_session), inline: true },
    );
  }
  if (stats.counters) {
    const c = stats.counters;
    fields.push(
      { name: "Notes placed", value: count(c.notes_placed), inline: true },
      { name: "Maps edited", value: count(c.maps_edited), inline: true },
      { name: "Maps created", value: count(c.maps_created), inline: true },
      { name: "Exports", value: count(c.exports), inline: true },
      { name: "Playtests", value: count(c.playtests), inline: true },
      { name: "Active days", value: count(c.active_days), inline: true },
    );
  }
  const handle = profile.handle ?? profile.username;
  return {
    embeds: [
      embed({
        title: `${profile.username} on Cascade`,
        url: profileUrl(env, handle),
        color: COLORS.accent,
        thumbnail: httpsUrl(profile.avatar_url) ? { url: profile.avatar_url! } : undefined,
        fields,
        footer: { text: "Only time spent in Cascade's editor is counted." },
      }),
    ],
  };
}

function formatMetric(metric: LeaderboardMetric, value: number): string {
  if (metric === "mapping_time") return duration(value);
  if (metric === "contribution_points") return `${count(value)} points`;
  return count(value);
}

async function leaderboardCommand(interaction: Interaction, env: WorkerEnv, deps: BotDeps): Promise<Reply> {
  const { options } = optionsOf(interaction);
  const board = LEADERBOARDS.find((b) => b.value === optString(options, "board")) ?? LEADERBOARDS[0];
  const rows = await deps.data.leaderboard(env, board.value);
  // Contribution points are public; the mapping boards list only people who
  // turned them on.
  const points = board.value === "contribution_points";
  if (!rows.length) {
    return {
      embeds: [
        embed({
          title: `${board.name} leaderboard`,
          description: points
            ? "No contributions have been accepted yet. Report bugs with /bug and ideas with /suggest; accepted ones earn points."
            : "Nobody is on this leaderboard yet. To appear, turn on the leaderboard in Cascade under Settings, Account.",
          color: COLORS.neutral,
        }),
      ],
    };
  }
  const lines = rows.map((row, i) => {
    const who = row.discord_user_id
      ? `<@${row.discord_user_id}>`
      : row.username && row.handle
        ? `[${plain(row.username)}](${profileUrl(env, row.handle)})`
        : "someone";
    return `**${i + 1}.** ${who} · ${formatMetric(board.value, row.value)}`;
  });
  return {
    embeds: [
      embed({
        title: `${board.name} leaderboard`,
        description: lines.join("\n"),
        color: COLORS.accent,
        footer: {
          text: points
            ? "Points from contributions the Cascade team accepted."
            : "Only people who chose to appear on leaderboards are listed.",
        },
      }),
    ],
  };
}

async function linkCommand(interaction: Interaction, env: WorkerEnv, deps: BotDeps): Promise<Reply> {
  const user = invokerOf(interaction);
  if (!user) return failure();
  const account = await deps.data.discordAccount(env, user.id);
  if (!account) return linkPrompt(env);
  return {
    embeds: [
      embed({
        title: "Your Discord account is connected",
        description: `It signs in to **${plain(account.username)}** on Cascade. Disconnect it any time in Settings, Account.`,
        color: COLORS.ok,
      }),
    ],
    components: [linkButton("Open your profile", profileUrl(env, account.handle))],
    ephemeral: true,
  };
}

async function contributionsCommand(
  interaction: Interaction,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps,
): Promise<Reply> {
  const user = invokerOf(interaction);
  if (!user) return failure();
  const { options } = optionsOf(interaction);
  const member = optString(options, "user");
  let account: DiscordAccount | null;
  let discordId: string;
  let self = true;
  if (member && member !== user.id) {
    account = await deps.data.discordAccount(env, member);
    if (!account || account.discord_lookup !== "everyone") {
      return notice("That member doesn't show their Cascade contributions on Discord.");
    }
    discordId = member;
    self = false;
  } else {
    account = await deps.data.discordAccount(env, user.id);
    discordId = user.id;
  }
  const status = await deps.data.contributor(env, account?.user_id ?? null, discordId);
  if (self) catchUpRole(interaction, env, ctx, status, deps);

  const toGo = Math.max(0, status.threshold - status.points);
  const role =
    status.override === "deny"
      ? "Not given"
      : status.contributor
        ? "Contributor"
        : `${count(toGo)} more ${toGo === 1 ? "point" : "points"} to Contributor`;
  const fields: NonNullable<Embed["fields"]> = [
    { name: "Points", value: count(status.points), inline: true },
    { name: "Accepted", value: count(status.accepted), inline: true },
    { name: "Role", value: role, inline: true },
  ];
  if (self && status.pending) fields.push({ name: "Waiting for review", value: count(status.pending), inline: true });
  if (status.recent.length) {
    fields.push({
      name: "Recently accepted",
      value: status.recent
        .slice(0, 8)
        .map((c) => `#${c.number} ${plain(clip(c.title, 60))} · +${c.points}`)
        .join("\n"),
    });
  }
  const name = self ? "Your contributions" : `${account?.username ?? "Their"} contributions`;
  return {
    embeds: [
      embed({
        title: name,
        color: status.contributor ? COLORS.accent : COLORS.neutral,
        description: status.accepted
          ? undefined
          : self
            ? "Nothing accepted yet. Report bugs with /bug and ideas with /suggest; accepted ones earn points."
            : "Nothing accepted yet.",
        fields,
        footer:
          self && !account
            ? { text: "Connect your Cascade account with /link so your points show on your profile." }
            : undefined,
      }),
    ],
  };
}

const ROADMAP_LABELS = { in_progress: "In progress", planned: "Planned", done: "Recently done" } as const;

async function roadmapCommand(env: WorkerEnv, deps: BotDeps): Promise<Reply> {
  const items = await deps.data.roadmap(env);
  if (!items.length) {
    return { embeds: [embed({ title: "Cascade roadmap", description: "Nothing is on the roadmap right now.", color: COLORS.neutral })] };
  }
  const fields = (Object.keys(ROADMAP_LABELS) as (keyof typeof ROADMAP_LABELS)[])
    .map((status) => ({
      name: ROADMAP_LABELS[status],
      value: items
        .filter((item) => item.status === status)
        .map((item) => `\`${item.id}\` **${plain(item.title)}**${item.details ? `\n${plain(clip(item.details, 160))}` : ""}`)
        .join("\n"),
    }))
    .filter((field) => field.value);
  return { embeds: [embed({ title: "Cascade roadmap", color: COLORS.accent, fields })] };
}

async function changelogCommand(env: WorkerEnv, deps: BotDeps): Promise<Reply> {
  const updates = await deps.data.updates(env);
  if (!updates.length) {
    return {
      embeds: [embed({ title: "Cascade releases", description: "No release notes have been published yet.", color: COLORS.neutral })],
      components: [linkButton("Open Cascade", env.FRONTEND_URL)],
    };
  }
  return {
    embeds: [
      embed({
        title: "Recent Cascade releases",
        color: COLORS.accent,
        fields: updates.map((u) => ({
          name: clip(`${u.version ? `${u.version}: ` : ""}${u.title}`, 200),
          value: `${plain(clip((u.body ?? "").trim() || "No details.", 600))}\n${when(u.created_at) ?? ""}`,
        })),
      }),
    ],
    components: [linkButton("Open Cascade", env.FRONTEND_URL)],
  };
}

function helpReply(forum: boolean): Reply {
  const posted = forum ? ", posted in the forum for you" : "";
  const lines = [
    "`/profile` your Cascade profile, a member's (if they allow it), or anyone's by Cascade name",
    "`/stats` mapping time, notes placed, maps edited, exports and playtests",
    "`/link` connect your Discord account to your Cascade account",
    "`/leaderboard` rankings of people who chose to appear on them",
    `\`/bug\` report a bug${posted}`,
    `\`/suggest\` suggest a feature${posted}`,
    "`/contributions` accepted contributions and contributor points",
    "`/roadmap` what is planned",
    "`/changelog` recent releases",
  ];
  return {
    embeds: [
      embed({
        title: "The Cascade bot",
        description: `${lines.join("\n")}\n\nThe bot only shows what a Cascade profile already shows to everyone. Choose what it may show in Cascade under Settings, Account.`,
        color: COLORS.accent,
      }),
    ],
    ephemeral: true,
  };
}

function contributionModal(kind: "bug" | "suggestion"): InteractionResponse {
  const bug = kind === "bug";
  return {
    type: MODAL,
    data: {
      custom_id: `contribute:${kind}`,
      title: bug ? "Report a bug in Cascade" : "Suggest a feature",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "title",
              style: 1,
              label: bug ? "What went wrong?" : "What would you like?",
              placeholder: bug ? "Export drops long notes on 7K" : "A metronome during playtest",
              min_length: 3,
              max_length: 120,
              required: true,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "details",
              style: 2,
              label: bug ? "Steps, what you expected, what happened" : "Why it would help",
              max_length: 2000,
              required: bug,
            },
          ],
        },
      ],
    },
  };
}

/** The text a form field was submitted with, wherever Discord nested it. */
function fieldValue(components: unknown, id: string): string {
  if (!Array.isArray(components)) return "";
  for (const item of components) {
    if (!item || typeof item !== "object") continue;
    const c = item as { custom_id?: unknown; value?: unknown; components?: unknown; component?: unknown };
    if (c.custom_id === id && typeof c.value === "string") return c.value;
    const nested = fieldValue(c.components, id) || fieldValue(c.component ? [c.component] : null, id);
    if (nested) return nested;
  }
  return "";
}

const KIND_LABELS = { bug: "Bug", suggestion: "Suggestion", other: "Contribution" } as const;

function channelUrl(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

/**
 * The forum post a report becomes, written like the posts people make by
 * hand: their title, "Posted by @them" (which pings them, and only them), and
 * what they wrote.
 */
export function forumPost(
  kind: "bug" | "suggestion",
  number: number,
  title: string,
  body: string,
  authorId: string,
): { title: string; message: Reply } {
  const head = `Posted by <@${authorId}>`;
  const foot = `-# #${number}, sent with ${kind === "bug" ? "/bug" : "/suggest"}`;
  const text = body ? clip(body, 2000 - head.length - foot.length - 4) : "";
  return {
    title: clip(title, 100),
    message: { content: [head, text, foot].filter(Boolean).join("\n\n"), mentions: [authorId] },
  };
}

/** The forum's own tag for the kind of report, found by its name. */
export function forumTagFor(kind: "bug" | "suggestion", tags: discordRest.ForumTag[]): string[] {
  const pattern = kind === "bug" ? /bug/i : /idea|request|suggest|feature/i;
  const tag = tags.find((t) => pattern.test(t.name));
  return tag ? [tag.id] : [];
}

/** What the bot answers in the forum post once a maintainer has decided. */
export function reviewOutcome(c: Contribution): Reply {
  const by = c.reviewed_by_discord ? `<@${c.reviewed_by_discord}>` : "the Cascade team";
  const note = c.review_note ? `\n> ${c.review_note}` : "";
  if (c.status === "accepted" && c.discord_user_id) {
    return {
      content: `Accepted by ${by}: <@${c.discord_user_id}> earned ${c.points} contributor points.${note}`,
      mentions: [c.discord_user_id],
    };
  }
  return { content: `${c.status === "accepted" ? "Accepted" : "Closed"} by ${by}.${note}` };
}

/** The message reviewers see in the review channel. */
export function reviewMessage(c: Contribution, withButtons: boolean, guildId = ""): Reply {
  const status =
    c.status === "accepted"
      ? `Accepted, +${c.points} points${c.reviewed_by_discord ? ` by <@${c.reviewed_by_discord}>` : ""}`
      : c.status === "rejected"
        ? `Rejected${c.reviewed_by_discord ? ` by <@${c.reviewed_by_discord}>` : ""}`
        : "Waiting for review";
  const components: ActionRow[] = withButtons && c.status === "pending"
    ? [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: `Accept #${c.number}`, custom_id: `review:accept:${c.number}` },
            { type: 2, style: 4, label: `Reject #${c.number}`, custom_id: `review:reject:${c.number}` },
          ],
        },
      ]
    : [];
  return {
    embeds: [
      embed({
        title: `#${c.number} ${KIND_LABELS[c.kind]}: ${c.title}`,
        description: c.body ? plain(clip(c.body, 1500)) : undefined,
        color: c.status === "accepted" ? COLORS.ok : c.status === "rejected" ? COLORS.danger : COLORS.warn,
        fields: [
          { name: "From", value: c.discord_user_id ? `<@${c.discord_user_id}>` : "Cascade", inline: true },
          { name: "Cascade account", value: c.linked ? "Linked" : "Not linked", inline: true },
          { name: "Status", value: status },
          ...(c.forum_thread_id && guildId
            ? [{ name: "Forum post", value: channelUrl(guildId, c.forum_thread_id) }]
            : []),
          ...(c.review_note ? [{ name: "Note", value: plain(c.review_note) }] : []),
        ],
        timestamp: c.created_at,
      }),
    ],
    components,
  };
}

async function submitContribution(
  interaction: Interaction,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps,
  kind: "bug" | "suggestion",
): Promise<Reply> {
  const user = invokerOf(interaction);
  if (!user) return failure();
  const title = fieldValue(interaction.data?.components, "title").trim();
  const body = fieldValue(interaction.data?.components, "details").trim();
  const result = await deps.data.submit(env, kind, title, body, user.id, displayName(user));
  if (result.error === "rate_limited") {
    return notice("You've sent a lot in a short time. Please wait a while before sending more.", COLORS.warn);
  }
  if (result.error === "duplicate") {
    return notice(`You already sent this as #${result.number}. The team will get to it.`, COLORS.warn);
  }
  if (result.error === "queue_full") {
    return notice("The review queue is full right now. Please try again later.", COLORS.warn);
  }
  if (result.error || !result.id || !result.number) {
    return notice("The title needs 3 to 120 characters and the details at most 2000.", COLORS.warn);
  }

  const id = result.id;
  const contribution: Contribution = {
    id,
    number: result.number,
    kind,
    title,
    body,
    status: "pending",
    points: 0,
    discord_user_id: user.id,
    discord_username: displayName(user),
    linked: result.linked === true,
    source: "discord",
    review_channel_id: null,
    review_message_id: null,
    forum_thread_id: null,
    reviewed_by_discord: null,
    review_note: null,
    created_at: new Date().toISOString(),
    reviewed_at: null,
  };
  const guild = setting(env.DISCORD_GUILD_ID) || interaction.guild_id || "";

  // The report goes up in the forum straight away, as a post by the person.
  let postUrl: string | null = null;
  const forum = setting(env.DISCORD_FORUM_CHANNEL_ID);
  if (forum && env.DISCORD_BOT_TOKEN) {
    const tags = await deps.rest.forumTags(env, forum);
    const post = forumPost(kind, result.number, title, body, user.id);
    const created = await deps.rest.createForumPost(env, forum, { ...post, tagIds: forumTagFor(kind, tags) });
    if (created.threadId) {
      contribution.forum_thread_id = created.threadId;
      if (guild) postUrl = channelUrl(guild, created.threadId);
      void later(ctx, deps.data.setForumThread(env, id, created.threadId));
    } else {
      log("forum_post_failed", { number: result.number, status: created.status });
    }
  }

  const channel = setting(env.DISCORD_REVIEW_CHANNEL_ID);
  if (channel && env.DISCORD_BOT_TOKEN) {
    contribution.review_channel_id = channel;
    void later(
      ctx,
      deps.rest.postMessage(env, channel, reviewMessage(contribution, true, guild)).then((messageId) =>
        messageId ? deps.data.setReviewMessage(env, id, channel, messageId) : null,
      ),
    );
  }
  log("contribution", { kind, number: result.number, forum: Boolean(postUrl) });
  const what = kind === "bug" ? "bug report" : "suggestion";
  const thanks = notice(
    `Thanks! Your ${what} is #${result.number}${postUrl ? ", posted in the forum" : ""}. The Cascade team reads every one, and accepted ones earn contributor points.` +
      (result.linked ? "" : "\n\nConnect your Cascade account with /link so the points show on your profile."),
    COLORS.ok,
  );
  return postUrl ? { ...thanks, components: [linkButton("Open your post", postUrl)] } : thanks;
}

// ---------------------------------------------------------------------------
// Maintainer tools
// ---------------------------------------------------------------------------

/** A maintainer's action, shown to the whole channel; only `mentions` are pinged. */
function announce(text: string, mentions: string[] = []): Reply {
  return { ...notice(text, COLORS.ok, false), mentions };
}

function statusLine(status: ContributorStatus): string {
  const role = status.override ? ` (role ${status.override === "grant" ? "granted" : "denied"} by an admin)` : "";
  return `${count(status.points)} points, ${status.contributor ? "Contributor" : "not a Contributor yet"}${role}.`;
}

async function afterReview(
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps,
  contribution: Contribution | undefined,
  editReviewMessage: boolean,
): Promise<void> {
  if (!contribution) return;
  const jobs: Promise<unknown>[] = [];
  if (contribution.status === "accepted" && contribution.discord_user_id) {
    jobs.push(syncContributorRole(env, contribution.discord_user_id, {}, deps));
  }
  if (editReviewMessage && contribution.review_channel_id && contribution.review_message_id) {
    jobs.push(
      deps.rest.editMessage(
        env,
        contribution.review_channel_id,
        contribution.review_message_id,
        reviewMessage(contribution, false, setting(env.DISCORD_GUILD_ID)),
      ),
    );
  }
  // Everyone following the forum post hears how it went.
  if (contribution.forum_thread_id) {
    jobs.push(deps.rest.postMessage(env, contribution.forum_thread_id, reviewOutcome(contribution)));
  }
  await later(ctx, Promise.all(jobs));
}

async function adminCommand(
  interaction: Interaction,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps,
): Promise<Reply> {
  const user = invokerOf(interaction);
  if (!user || !(await isMaintainer(interaction, env, deps))) {
    return notice("Only Cascade maintainers can use this.", COLORS.danger);
  }
  const { sub, options } = optionsOf(interaction);
  switch (sub) {
    case "pending": {
      const items = await deps.data.pending(env);
      if (!items.length) return notice("Nothing is waiting for review.", COLORS.ok);
      const replies = items.map((c) => reviewMessage(c, true, setting(env.DISCORD_GUILD_ID)));
      return {
        embeds: replies.flatMap((r) => r.embeds ?? []),
        components: replies.flatMap((r) => r.components ?? []).slice(0, 5),
        ephemeral: true,
      };
    }
    case "review": {
      const number = optInt(options, "number");
      const decision = optString(options, "decision");
      if (!number || (decision !== "accept" && decision !== "reject")) return failure();
      const result = await deps.data.review(env, number, decision === "accept", user.id, optInt(options, "points"), optString(options, "note"));
      if (result.result === "not_found") return notice(`There is no contribution #${number}.`, COLORS.warn);
      if (result.result === "own_submission") return notice("You can't review your own contribution.", COLORS.warn);
      if (result.result === "already_reviewed") return notice(`#${number} was already reviewed.`, COLORS.warn);
      await afterReview(env, ctx, deps, result.contribution, true);
      const c = result.contribution;
      return announce(
        `#${number} ${c?.status === "accepted" ? `accepted, +${c.points} points` : "rejected"}.${result.status ? ` They now have ${statusLine(result.status)}` : ""}`,
      );
    }
    case "award": {
      const member = optString(options, "user");
      const points = optInt(options, "points");
      const reason = optString(options, "reason");
      if (!member || !points || !reason) return failure();
      const result = await deps.data.award(env, member, reason, points, user.id);
      if (result.result === "own_submission") return notice("You can't award points to yourself.", COLORS.warn);
      await afterReview(env, ctx, deps, result.contribution, false);
      return announce(
        `Recorded +${points} points for <@${member}>: ${plain(reason)}.${result.status ? ` They now have ${statusLine(result.status)}` : ""}`,
        [member],
      );
    }
    case "contributor": {
      const member = optString(options, "user");
      const mode = optString(options, "mode");
      if (!member || (mode !== "grant" && mode !== "deny" && mode !== "auto")) return failure();
      const status = await deps.data.override(env, member, mode, optString(options, "note"), user.id);
      const change = await deps.rest.setContributorRole(env, member, status.contributor);
      const roleNote = change === "failed" ? " Discord refused the role change; check that the bot's role is above the Contributor role." : "";
      return change === "failed"
        ? notice(`<@${member}>: ${statusLine(status)}${roleNote}`, COLORS.warn)
        : announce(`<@${member}>: ${statusLine(status)}`);
    }
    case "points": {
      const bug = optInt(options, "bug");
      const suggestion = optInt(options, "suggestion");
      const threshold = optInt(options, "threshold");
      const settings =
        bug === null && suggestion === null && threshold === null
          ? await deps.data.settings(env)
          : await deps.data.setSettings(env, bug, suggestion, threshold);
      return {
        embeds: [
          embed({
            title: "Contribution points",
            color: COLORS.accent,
            fields: [
              { name: "Accepted bug report", value: count(settings.bug_points), inline: true },
              { name: "Accepted suggestion", value: count(settings.suggestion_points), inline: true },
              { name: "Contributor role at", value: `${count(settings.role_threshold)} points`, inline: true },
              {
                name: "Sending limits",
                value: `${settings.hourly_limit} an hour, ${settings.daily_limit} a day per member`,
              },
            ],
            footer: { text: "Changes apply to contributions reviewed from now on." },
          }),
        ],
        ephemeral: false,
      };
    }
    case "roadmap-add": {
      const title = optString(options, "title");
      if (!title) return failure();
      const item = await deps.data.saveRoadmap(env, null, title, optString(options, "details") ?? "", optString(options, "status") ?? "planned");
      return item ? announce(`Added item ${item.id} to the roadmap: ${plain(item.title)}.`) : notice("Couldn't add that.", COLORS.warn);
    }
    case "roadmap-status": {
      const id = optInt(options, "item");
      const status = optString(options, "status");
      if (!id || !status) return failure();
      const item = await deps.data.saveRoadmap(env, id, null, null, status);
      return item ? announce(`Item ${item.id}, ${plain(item.title)}, is now ${ROADMAP_LABELS[item.status].toLowerCase()}.`) : notice(`There is no roadmap item ${id}.`, COLORS.warn);
    }
    case "roadmap-remove": {
      const id = optInt(options, "item");
      if (!id) return failure();
      return (await deps.data.removeRoadmap(env, id))
        ? announce(`Removed item ${id} from the roadmap.`)
        : notice(`There is no roadmap item ${id}.`, COLORS.warn);
    }
    default:
      return failure();
  }
}

async function reviewButton(
  interaction: Interaction,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps,
  accept: boolean,
  number: number,
): Promise<InteractionResponse> {
  const user = invokerOf(interaction);
  if (!user || !(await isMaintainer(interaction, env, deps))) {
    return message(notice("Only Cascade maintainers can review contributions.", COLORS.danger));
  }
  const result = await deps.data.review(env, number, accept, user.id, null, null);
  if (result.result === "own_submission") return message(notice("You can't review your own contribution.", COLORS.warn));
  if (!result.contribution) return message(notice(`There is no contribution #${number}.`, COLORS.warn));
  if (result.result === "reviewed") await afterReview(env, ctx, deps, result.contribution, false);
  // The message the button is on becomes the record of the decision.
  return update(reviewMessage(result.contribution, false, setting(env.DISCORD_GUILD_ID) || interaction.guild_id));
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export async function handleInteraction(
  interaction: Interaction,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps = DEFAULT_DEPS,
): Promise<InteractionResponse> {
  if (interaction.type === PING) return { type: PING };

  if (interaction.type === APPLICATION_COMMAND) {
    const name = interaction.data?.name ?? "";
    const run = (work: () => Promise<Reply>, ephemeral: boolean) =>
      answer(work, interaction, env, ctx, deps, { ephemeral, name });
    switch (name) {
      case "profile":
        return run(() => profileCommand(interaction, env, deps), false);
      case "stats":
        return run(() => statsCommand(interaction, env, deps), false);
      case "link":
        return run(() => linkCommand(interaction, env, deps), true);
      case "leaderboard":
        return run(() => leaderboardCommand(interaction, env, deps), false);
      case "bug":
        return contributionModal("bug");
      case "suggest":
        return contributionModal("suggestion");
      case "contributions":
        return run(() => contributionsCommand(interaction, env, ctx, deps), false);
      case "roadmap":
        return run(() => roadmapCommand(env, deps), false);
      case "changelog":
        return run(() => changelogCommand(env, deps), false);
      case "help":
        return message(helpReply(Boolean(setting(env.DISCORD_FORUM_CHANNEL_ID))));
      case "cascade-admin":
        // Actions answer the whole channel; the review queue stays private.
        // The "thinking" placeholder has to match, so it's decided here.
        return run(() => adminCommand(interaction, env, ctx, deps), optionsOf(interaction).sub === "pending");
      default:
        return message(notice("This command isn't available any more."));
    }
  }

  if (interaction.type === MODAL_SUBMIT) {
    const kind = interaction.data?.custom_id === "contribute:bug"
      ? "bug"
      : interaction.data?.custom_id === "contribute:suggestion"
        ? "suggestion"
        : null;
    if (!kind) return message(notice("This form isn't available any more."));
    return answer(() => submitContribution(interaction, env, ctx, deps, kind), interaction, env, ctx, deps, {
      ephemeral: true,
      name: `submit_${kind}`,
    });
  }

  if (interaction.type === MESSAGE_COMPONENT) {
    const review = /^review:(accept|reject):(\d{1,12})$/.exec(interaction.data?.custom_id ?? "");
    if (review) {
      return reviewButton(interaction, env, ctx, deps, review[1] === "accept", Number(review[2])).catch(() =>
        message(failure()),
      );
    }
    return message(notice("This button isn't available any more."));
  }

  return message(notice("Cascade's bot doesn't handle this yet."));
}

/** Who can manage the bot from Cascade itself: Cascade admins only. */
async function cascadeAdmin(req: Request, env: WorkerEnv): Promise<boolean> {
  const token = bearerToken(req);
  const session = token ? await verifySession(env, token) : null;
  if (!session) return false;
  const user = await fetchSessionUser(env, session.uid).catch(() => null);
  return user?.is_admin === true;
}

export async function handleDiscordRoute(
  req: Request,
  url: URL,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  deps: BotDeps = DEFAULT_DEPS,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/discord/")) return null;

  if (url.pathname === "/discord/interactions") {
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405, env);
    const key = setting(env.DISCORD_PUBLIC_KEY);
    if (!key) return json({ error: "the bot isn't set up" }, 503, env);
    const body = await verifyInteraction(req, key);
    if (body === null) return new Response("invalid request signature", { status: 401 });
    let interaction: Interaction;
    try {
      interaction = JSON.parse(body) as Interaction;
    } catch {
      return new Response("invalid body", { status: 400 });
    }
    const response = await handleInteraction(interaction, env, ctx, deps);
    return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
  }

  // What the admin panel shows while setting the bot up, and its button to
  // register the slash commands with Discord.
  if (url.pathname === "/discord/status" || url.pathname === "/discord/commands") {
    if (!(await cascadeAdmin(req, env))) return json({ error: "admins only" }, 403, env);
    if (url.pathname === "/discord/status") {
      if (req.method !== "GET") return json({ error: "method not allowed" }, 405, env);
      return json(
        {
          login: discordReady(env),
          applicationId: Boolean(setting(env.DISCORD_APPLICATION_ID)),
          publicKey: Boolean(setting(env.DISCORD_PUBLIC_KEY)),
          clientSecret: Boolean(env.DISCORD_CLIENT_SECRET),
          botToken: Boolean(env.DISCORD_BOT_TOKEN),
          guild: Boolean(setting(env.DISCORD_GUILD_ID)),
          contributorRole: Boolean(setting(env.DISCORD_CONTRIBUTOR_ROLE_ID)),
          reviewChannel: Boolean(setting(env.DISCORD_REVIEW_CHANNEL_ID)),
          forumChannel: Boolean(setting(env.DISCORD_FORUM_CHANNEL_ID)),
          interactionsUrl: `${url.origin}/discord/interactions`,
          redirectUri: setting(env.DISCORD_REDIRECT_URI),
        },
        200,
        env,
      );
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405, env);
    if (!setting(env.DISCORD_APPLICATION_ID) || !env.DISCORD_BOT_TOKEN) {
      return json({ error: "set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN first" }, 409, env);
    }
    const result = await deps.rest.putCommands(env, COMMANDS);
    log("commands_registered", { ok: result.ok, status: result.status, scope: result.scope });
    return json(
      { ok: result.ok, scope: result.scope, count: COMMANDS.length, status: result.status },
      result.ok ? 200 : 502,
      env,
    );
  }

  return json({ error: "not found" }, 404, env);
}
