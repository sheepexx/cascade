# Setting up Discord login and the Cascade bot

A step-by-step guide for someone who has never made a Discord bot. It covers
"Log in with Discord" on the website and the desktop app, linking Discord to
existing accounts, and the official Cascade bot (slash commands,
contributions, the Contributor role).

How it all fits: [ACCOUNTS.md](ACCOUNTS.md).

## What you are setting up

- **One Discord application** does both jobs: its OAuth2 part handles
  "Continue with Discord", and its bot part answers slash commands.
- **The bot runs inside Cascade's existing Cloudflare Worker.** Discord sends
  each command to `https://mania-editor.noahcraft01.workers.dev/discord/interactions`
  and the Worker answers. There is no separate bot program to keep running,
  no server to rent, and nothing runs on your PC.
- **Secrets** (the OAuth2 client secret and the bot token) live only in the
  Cloudflare dashboard as encrypted secrets. **Public IDs** (application ID,
  public key, server ID, role ID, channel ID) go in `worker/wrangler.jsonc`,
  next to osu!'s `CLIENT_ID`, because every push replaces the Worker's plain
  variables with that file.

Never paste the client secret or the bot token into a chat, a commit, an
issue or a screenshot. If one leaks, see [Rotating a leaked token](#18-rotating-a-leaked-bot-token).

## Values you will need

| What | Value |
| --- | --- |
| Worker | `https://mania-editor.noahcraft01.workers.dev` |
| OAuth2 redirect | `https://mania-editor.noahcraft01.workers.dev/auth/discord/callback` |
| Interactions endpoint | `https://mania-editor.noahcraft01.workers.dev/discord/interactions` |
| Website | `https://cascade.sheepex.net` |
| Supabase SQL editor | `https://supabase.com/dashboard/project/splqsxhwdusjeqthinxz/sql/new` |
| Bot permissions integer | `268454912` (View Channels, Send Messages, Embed Links, Manage Roles) |

## 1. Create the Discord application

1. Open <https://discord.com/developers/applications> and sign in with the
   Discord account that should own Cascade's app (yours).
2. Click **New Application**, name it **Cascade**, accept the terms, click
   **Create**.
3. On **General Information**, upload the Cascade logo (`public/logo.png`)
   as the app icon, and add a short description such as "The official
   Cascade bot and login."
4. Add the links: **Terms of Service URL** `https://cascade.sheepex.net/terms`
   and **Privacy Policy URL** `https://cascade.sheepex.net/privacy`. Discord
   shows them on the login screen. Save.

## 2. Configure OAuth2 for "Log in with Discord"

1. Open **OAuth2** in the left menu.
2. Under **Redirects**, click **Add Redirect** and paste exactly:
   `https://mania-editor.noahcraft01.workers.dev/auth/discord/callback`
   Save. It must match character for character: no trailing slash, https.
3. Under **Client Secret**, click **Reset Secret**, confirm, and copy it.
   You only see it once. Keep the tab open until step 12, or store it in your
   password manager.
4. Leave **Public Client** off. Cascade keeps the secret on the Worker and
   also uses PKCE.

Cascade asks Discord only for the `identify` scope: the account's id, name
and avatar. Never its email, servers or messages.

## 3. Create and configure the bot

1. Open **Bot** in the left menu.
2. Set the bot's username (Cascade) and picture.
3. Turn **Public Bot** off, so only you can add it to servers.
4. Leave **Requires OAuth2 Code Grant** off.
5. Under **Privileged Gateway Intents**, leave **all three off** (Presence,
   Server Members, Message Content). The bot only answers slash commands,
   buttons and forms, which need no intents.

## 4. Find the IDs you need

- **Application ID**: General Information, "Application ID". Copy it.
  Discord's OAuth2 client ID is the same number.
- **Public Key**: General Information, "Public Key" (64 hex characters).
- **Server ID, role ID, channel ID**: in the Discord app open User Settings,
  Advanced, and turn on **Developer Mode**. Then right-click your server icon,
  a role (Server Settings, Roles) or a channel and choose **Copy ID**.

These are public identifiers, not secrets. You can send them to whoever
updates `wrangler.jsonc` for you.

## 5. Generate the bot token and store it safely

1. On **Bot**, click **Reset Token**, confirm (Discord may ask for your 2FA
   code) and copy the token.
2. Paste it straight into the Cloudflare dashboard in step 12, not anywhere
   else. Anyone with this token can act as your bot.

## 6. Permissions and intents

The bot needs, in your server:

| Permission | Why |
| --- | --- |
| View Channels | See the review channel |
| Send Messages, Embed Links | Post new reports to the review channel |
| Manage Roles | Give and take the Contributor role |

It needs **no** privileged intents and no Administrator permission. Slash
commands don't need Read Message History or Message Content.

## 7. Invite the bot to your server

Open this address in your browser, with your application ID in place of
`APP_ID`:

```
https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot+applications.commands&permissions=268454912
```

Choose the Cascade server and authorize. The bot appears offline in the
member list; that is normal for a bot that answers over HTTP instead of a
gateway connection.

## 8. The Contributor role and role order

1. Server Settings, **Roles**, **Create Role**: name it **Contributor**, pick
   a colour, and give it no permissions it doesn't need. Copy its ID.
2. Drag the bot's own role (named after the app, Cascade) **above** the
   Contributor role. Discord only lets a bot give roles below its own; this is
   the most common reason role changes fail.
3. Optional: make a private channel such as `#contribution-review` that only
   maintainers and the bot can see, and copy its ID. New `/bug` and
   `/suggest` reports are posted there with Accept and Reject buttons.

Who counts as a maintainer for `/cascade-admin` and the review buttons:
members with the **Administrator** permission in the Cascade server, Discord
accounts linked to a Cascade admin, and any Discord user IDs you list in
`DISCORD_MAINTAINER_IDS`. `/cascade-admin` is hidden from everyone else by
default; to show it to someone without Administrator, use Server Settings,
Integrations, Cascade, and allow them on `/cascade-admin` (the bot still
checks them itself).

## 9. Register and test the slash commands

Do this after the Worker has your IDs and token (steps 11 and 12):

1. Sign in to Cascade as an admin, open the account menu, **Admin**,
   **Settings**, section **Discord login and bot**.
2. Every line should say "set". Click **Register slash commands**.
3. With a server ID set, the commands appear in your server right away
   (otherwise they are global and can take up to an hour).
4. In Discord, type `/help` in any channel. The bot answers with its list
   of commands.

Run **Register slash commands** again whenever a Cascade update changes the
commands; it replaces the whole list and is safe to repeat.

## 10. Supabase: apply the migrations

1. Open the SQL editor:
   <https://supabase.com/dashboard/project/splqsxhwdusjeqthinxz/sql/new>
2. Open `supabase/migrations/0047_account_identities.sql` in VS Code, copy
   all of it, paste it into the editor, and click **Run**. It should end with
   "Success. No rows returned".
3. Do the same with `supabase/migrations/0048_discord_community.sql`.
4. Check that every osu! account got its identity; both numbers must match:

```sql
select
  (select count(*) from public.users where osu_id is not null) as osu_accounts,
  (select count(*) from public.account_identities where provider = 'osu') as osu_identities;
```

Both files are safe to run twice, and the site keeps working with them even
before the new Worker is deployed. Nothing else in Supabase needs changing:
the Worker reaches the database with its existing service key.

## 11. The Worker's public settings (`worker/wrangler.jsonc`)

In `worker/wrangler.jsonc`, under `"vars"`, fill in:

```jsonc
"DISCORD_APPLICATION_ID": "your application ID",
"DISCORD_PUBLIC_KEY": "your public key",
"DISCORD_REDIRECT_URI": "https://mania-editor.noahcraft01.workers.dev/auth/discord/callback",
"DISCORD_GUILD_ID": "your server ID",
"DISCORD_CONTRIBUTOR_ROLE_ID": "the Contributor role ID",
"DISCORD_REVIEW_CHANNEL_ID": "the review channel ID (or leave empty)",
"DISCORD_MAINTAINER_IDS": "Discord user IDs, comma separated (or leave empty)"
```

Then regenerate the Worker's types so the check in CI passes:

```bash
npm run types --prefix worker
```

## 12. The Worker's secrets (Cloudflare dashboard)

1. Open <https://dash.cloudflare.com>, **Workers & Pages**, **mania-editor**,
   **Settings**, **Variables and Secrets**.
2. Click **Add**, choose type **Secret**, name `DISCORD_CLIENT_SECRET`, paste
   the OAuth2 client secret from step 2, and **Deploy**.
3. Again: **Secret**, name `DISCORD_BOT_TOKEN`, paste the bot token from step
   5, **Deploy**.

Secrets survive every deploy from GitHub, unlike plain variables, which is
why the IDs live in `wrangler.jsonc` and only these two live here. The
existing secrets (`CLIENT_SECRET`, `COOKIE_SECRET`, `SUPABASE_JWT_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`) stay as they are.

### All the settings at a glance

| Name | Kind | Where | Needed for |
| --- | --- | --- | --- |
| `DISCORD_APPLICATION_ID` | public | wrangler.jsonc | login and bot |
| `DISCORD_CLIENT_SECRET` | secret | Cloudflare | login |
| `DISCORD_REDIRECT_URI` | public | wrangler.jsonc (already set) | login |
| `DISCORD_PUBLIC_KEY` | public | wrangler.jsonc | bot |
| `DISCORD_BOT_TOKEN` | secret | Cloudflare | roles, review channel, registering commands |
| `DISCORD_GUILD_ID` | public | wrangler.jsonc | roles, maintainer checks, instant commands |
| `DISCORD_CONTRIBUTOR_ROLE_ID` | public | wrangler.jsonc | the Contributor role |
| `DISCORD_REVIEW_CHANNEL_ID` | public | wrangler.jsonc | posting reports for review (optional) |
| `DISCORD_MAINTAINER_IDS` | public | wrangler.jsonc | extra maintainers (optional) |
| `AUTH_LIMITER` | binding | wrangler.jsonc (already set) | rate limits |

Login works with the first three. The bot needs the public key; its role and
review features need the token, server and role.

## 13. Running it locally (optional)

You don't need this to use the bot. It is for trying changes before they go
live, and needs its own **test** Discord application so the real one keeps
pointing at the live Worker.

1. Make a second application in the Developer Portal (Cascade Dev), with the
   redirect `http://localhost:8787/auth/discord/callback`.
2. Create `worker/.dev.vars` (already ignored by git), one `NAME=value` per
   line. Values here override `wrangler.jsonc` while running locally:
   `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_SECRET`
   and `DISCORD_BOT_TOKEN` from the test app,
   `DISCORD_REDIRECT_URI=http://localhost:8787/auth/discord/callback`,
   `FRONTEND_URL=http://localhost:5173`, and the other Worker secrets
   (`CLIENT_SECRET`, `COOKIE_SECRET`, `SUPABASE_JWT_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`). Point the app at it with
   `VITE_WORKER_URL=http://localhost:8787` in `.env.local`.
3. Run the Worker: `npm run dev --prefix worker` (it listens on port 8787).
4. Discord must reach your PC for slash commands: run
   `npx cloudflared tunnel --url http://localhost:8787`, and paste the
   `https://….trycloudflare.com/discord/interactions` address it prints into
   the **test** app's Interactions Endpoint URL.

## 14. Hosting (keeping the bot online)

The bot already runs on Cloudflare Workers, the same place as Cascade's API,
so it is online whenever Cascade is: your PC can be off. Cloudflare's free
plan includes 100,000 requests a day, far more than a community bot uses.
There is nothing to restart: each command runs fresh, and a crash in one
can't take the bot down.

A gateway bot (discord.js on a small server) was considered and not chosen:
nothing here needs a live gateway connection (no message reading, no
presence), it would cost a server and upkeep, and it would need the
database's service key on another machine.

## 15. Deploying updates

Push to `master` as usual. Cloudflare Workers Builds deploys the Worker (bot
included) and Vercel deploys the site. If an update changes the slash
commands, press **Register slash commands** in the admin panel afterwards.

Order for this first rollout:

1. Apply the two migrations (step 10).
2. Merge and push; check that logging in with osu! still works and lands on
   your existing account.
3. Do steps 1 to 8, then 11 and 12, and push the `wrangler.jsonc` change.
4. In the Developer Portal, General Information, set **Interactions Endpoint
   URL** to `https://mania-editor.noahcraft01.workers.dev/discord/interactions`
   and save. Discord checks it immediately; it only saves once the deployed
   Worker has your public key.
5. Register the slash commands (step 9).

## 16. Testing login, linking and roles

Use a private window so your normal session is untouched.

1. **Login:** Log in, Continue with Discord, approve. You land back in
   Cascade with a new account named after your Discord name.
2. **Linking:** in your normal (osu!) account open Settings, **Account**,
   Discord, **Connect**. If you logged in a while ago Cascade first asks you
   to confirm with osu!. Approve on Discord; Discord now shows as connected.
3. **Conflict:** try connecting the Discord account from step 1 (which
   already has its own Cascade account) to another account. Cascade says
   "This account is already connected to another Cascade profile." and
   changes nothing.
4. **Bot:** `/link` (shows your linked account), `/profile`, `/stats`,
   `/bug` (fill the form), then accept it in the review channel. With
   `/cascade-admin points threshold:10`, one accepted bug gives the
   Contributor role; check it appears on the member.
5. **Desktop:** in the desktop app, Log in, Continue with Discord; finish in
   the browser and the app signs in.

## 17. Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| No Discord button in Cascade | `DISCORD_APPLICATION_ID` or `DISCORD_CLIENT_SECRET` missing | Steps 11 and 12; check the admin panel's Discord section |
| Discord says "Invalid OAuth2 redirect_uri" | Redirect not saved, or a typo | Step 2: paste it exactly |
| Back in Cascade with "didn't confirm the login" | Wrong client secret, or the code was reused | Reset the secret and update the Cloudflare secret |
| "That login expired or was opened in another browser" | The login took over 10 minutes, or cookies are blocked for the Worker | Try again in one browser tab |
| Portal won't save the Interactions Endpoint URL | Worker doesn't have the public key yet, or it's wrong | Push `wrangler.jsonc` with `DISCORD_PUBLIC_KEY`, wait for the deploy, save again |
| Slash commands don't show | Not registered, or registered globally (up to an hour) | Admin panel, Register slash commands; set `DISCORD_GUILD_ID` |
| "This interaction failed" | The Worker errored | Cloudflare dashboard, mania-editor, **Logs**, look for `discord.error` |
| Contributor role not given | Bot's role below Contributor, or no Manage Roles | Step 8: drag the bot's role above |
| `/cascade-admin` says only maintainers | You aren't Administrator in that server or listed | Step 8 |
| CI fails on "types are out of date" | `wrangler.jsonc` changed without regenerating | `npm run types --prefix worker` and commit |

## 18. Rotating a leaked bot token

1. Developer Portal, **Bot**, **Reset Token**. The old token stops working at
   once.
2. Cloudflare, mania-editor, Variables and Secrets, edit
   `DISCORD_BOT_TOKEN`, paste the new one, **Deploy**.

For a leaked client secret do the same on **OAuth2**, Reset Secret, and the
`DISCORD_CLIENT_SECRET` secret. People who are signed in stay signed in.

## 19. Turning it off safely

- **Bot only:** clear the Interactions Endpoint URL in the Developer Portal
  (commands then fail in Discord), or kick the bot from the server.
  Logins are unaffected.
- **Discord login:** set `DISCORD_APPLICATION_ID` to `""` in
  `wrangler.jsonc` and push, or delete the `DISCORD_CLIENT_SECRET` secret.
  The Discord buttons disappear. **Accounts made with Discord can't log in
  while it is off**; their data stays, and they get back in once it is on.
  People with osu! connected can still log in with osu!.
- Nothing is deleted either way. Undoing everything, the database included,
  is in [ACCOUNTS.md](ACCOUNTS.md#rolling-back).

## 20. Looking after it

- **Each release:** if commands changed, Register slash commands.
- **Weekly:** `/cascade-admin pending` to clear the review queue; adjust
  points with `/cascade-admin points`.
- **Abuse:** `/cascade-admin contributor user:@someone mode:deny` takes the
  role and keeps it off whatever their points; `mode:auto` returns to points.
  Submissions are limited per member, and duplicates are refused.
- **Roadmap:** `/cascade-admin roadmap-add`, `roadmap-status`,
  `roadmap-remove`. **Changelog:** `/changelog` shows the update notes you
  publish from the admin panel's Notifications tab.
- **Yearly or after a leak:** rotate the bot token and client secret.
- **Watch:** Cloudflare's Worker logs (`discord.*` events) and the admin
  panel's Discord section, which shows anything missing.
