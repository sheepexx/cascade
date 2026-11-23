import type { WorkerEnv } from "./storage";

/**
 * The Worker's Discord settings and rate limiter for tests that don't use
 * them: Discord switched off, every request allowed. Cast, because the
 * generated types pin each setting to the value in wrangler.jsonc.
 */
export const DISCORD_OFF = {
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
  DISCORD_APPLICATION_ID: "",
  DISCORD_PUBLIC_KEY: "",
  DISCORD_REDIRECT_URI: "https://mania-editor.noahcraft01.workers.dev/auth/discord/callback",
  DISCORD_GUILD_ID: "",
  DISCORD_CONTRIBUTOR_ROLE_ID: "",
  DISCORD_REVIEW_CHANNEL_ID: "",
  DISCORD_FORUM_CHANNEL_ID: "",
  DISCORD_MAINTAINER_IDS: "",
} as unknown as Pick<
  WorkerEnv,
  | "AUTH_LIMITER"
  | "DISCORD_APPLICATION_ID"
  | "DISCORD_PUBLIC_KEY"
  | "DISCORD_REDIRECT_URI"
  | "DISCORD_GUILD_ID"
  | "DISCORD_CONTRIBUTOR_ROLE_ID"
  | "DISCORD_REVIEW_CHANNEL_ID"
  | "DISCORD_FORUM_CHANNEL_ID"
  | "DISCORD_MAINTAINER_IDS"
>;
