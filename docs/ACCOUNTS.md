# Accounts and sign-in

How Cascade accounts work now that they can be reached through osu!,
Discord or both, and why it is built the way it is. Setting Discord up is a
separate walkthrough: [DISCORD_SETUP.md](DISCORD_SETUP.md).

## The model

- **`public.users.id` is the account.** Everything (projects, presets,
  friends, messages, mapping statistics, settings, skins, cards) keys on it.
  It never changes; a trigger refuses any update to it.
- **`public.account_identities`** (migration 0047) holds the ways an account
  signs in: one row per provider account, keyed by the provider's stable id
  (`provider_user_id`, never a username). Unique indexes allow one Cascade
  account per provider account, and one provider account per provider per
  Cascade account.
- **`users.osu_id` stays** as a mirror of the osu! identity, so every query,
  RPC and admin view that reads it keeps working. It is null for an account
  made with Discord that hasn't connected osu!. No placeholder ids are made up.
- **`users.profile_provider`** is the provider the account was made with.
  Signing in with it refreshes the profile's name and avatar (osu! names as
  osu! has them; Discord names tidied and made unique). Linking a second
  provider never touches the name or avatar.

Only the Worker reads or writes identities, through SECURITY DEFINER
functions granted to `service_role` alone. Signed-in users, admins included,
can't select, insert or delete identity rows, can't call those functions, and
can't edit `osu_id` or `profile_provider` through the API.

## Flows

All three share `GET /auth/{osu|discord}/login` and `/callback`.

| Flow | Started by | Callback result |
| --- | --- | --- |
| Log in | Any "Log in" button, or the account prompt | A session for the account the identity belongs to, or for a new account |
| Link | Settings, Account, Connect (needs a ticket) | A link token for the app, which finishes the link with its own session |
| Confirm it's you | The prompt before linking or unlinking with an old session (needs a ticket) | A fresh session for the same account, or an error if the identity is someone else's |

**Login** calls `auth_sign_in`, which takes an advisory lock on the provider
account, finds its identity or creates the account, and returns it. It never
attaches anything to whoever is signed in. An osu! account from before 0047
without an identity row is matched by `users.osu_id` and given one, so it
keeps its original id.

**Linking** is two steps on purpose. `POST /auth/link/start` (bearer session,
signed in within the last 15 minutes) returns a one-time ticket bound to the
account. The callback proves who owns the provider account and hands the app
a link token (10 minutes, one use). The app then calls
`POST /auth/link/complete` with its own session, and the Worker refuses unless
that session is the account the ticket was made for. A link URL someone else
sends you therefore does nothing to your account. `link_account_identity`
returns `linked`, `already_linked`, `claimed` (another account has it; nothing
changes) or `provider_taken`.

**Unlinking** (`POST /auth/identities/unlink`) needs a fresh session too, and
`unlink_account_identity` refuses to remove the last identity. Unlinking osu!
clears `users.osu_id` and the cached osu! profile numbers; the account, its
maps and everything else stay. When the removed provider was the profile's
source, the profile follows the remaining one from then on.

**Desktop**: the app opens the same URLs in the system browser with
`client=desktop&port&nonce`. The result comes back to the app's loopback
listener as `session=<token>`, `session=link:<token>` or
`session=error:<reason>`, checked against the nonce.

## Security properties

- **CSRF and login CSRF.** Each flow's state, PKCE verifier, intent, ticket id
  and desktop port live in a signed, HttpOnly, `SameSite=Lax` cookie per
  provider, never in the URL. A callback without the matching cookie is
  refused.
- **PKCE** (S256) for Discord, alongside the client secret. osu! doesn't
  document PKCE, so its exchange is unchanged: client secret plus the state
  cookie.
- **Codes and tokens.** Authorization codes are exchanged on the Worker and
  work once (the provider refuses a replay). Provider access tokens are used
  inside the callback and never stored, logged or sent to the app.
- **One-time tickets and link tokens** are recorded in `auth_used_tokens`
  when used; a replay fails.
- **Token confusion.** Tickets, link tokens and flow cookies carry an issuer
  and a purpose and use `sub`, not `uid`; `verifySession` rejects anything with
  either, so none of them can pass as a session.
- **Changing sign-in methods** needs the session in an `Authorization`
  header (never the cross-site cookie), a JSON body, an allowed Origin, and a
  session signed in within 15 minutes (`at` claim, kept across refreshes).
  Sessions from before this change have no `at`, so they confirm once.
- **Session fixation.** The app only adopts a `#session=` or `#link=` result
  if this browser started a sign-in in the last 15 minutes (a one-use marker
  in local storage, which other sites can't write).
- **Rate limits.** `AUTH_LIMITER` (Workers rate limiting binding): 30
  requests a minute per address for sign-in and account changes.
  Approximate and per Cloudflare location.
- **Scopes.** Discord: `identify` only. osu!: `identify`, as before.
- **Concurrency.** Every identity change takes an advisory lock per provider
  account, then the account row, in that order; unique indexes are the
  backstop. Three simultaneous callbacks for one new Discord account make one
  account (tested).

## Names

Usernames are display names, not identities. Two accounts can share one:
someone made with Discord and someone who later signs in with osu! under the
same name, for example.

- Names Cascade chooses (from Discord) are tidied (whitespace folded;
  control, invisible and `/ \ < >` characters removed; 32 characters) and
  numbered when taken: `nelly`, `nelly#2`.
- `find_user_id` resolves an account id first, then a name (an osu!-sourced
  account wins a shared name, then the most recently seen), then an osu! id.
- Profile cards carry `handle`: the name when it leads to that account,
  otherwise the account id. Links in the app use it, so a shared name never
  opens the wrong person. `add_collaborator` resolves names the same way.

## Accounts without osu!

They can save cloud projects, collaborate, comment, message, befriend, see
their statistics, get notifications and send feedback (all key on
`users.id`). osu!-only parts degrade instead of breaking: the profile shows
Cascade's numbers and, to its owner, how to connect osu!; menu covers, the
osu! map library and osu! links are left out; the export asks for the
Creator name instead of using a Discord-derived name.

## The Discord bot's access

The bot (worker/src/discord) answers Discord's signed HTTP interactions in
the Worker. It reads profiles, statistics and the roadmap through the public
functions with an anonymous token, so it sees what a signed-out visitor sees.
Its own functions (0048) are service-role only and return no private data.
Two opt-in settings (`social_privacy.discord_lookup` and `leaderboard`,
default off) decide whether others can open your profile from your Discord
account and whether you appear on leaderboards. A member who hasn't linked
and one who keeps lookups off get the same answer.

Contributions earn points only when a maintainer accepts them, once
(`review_contribution` locks the row and only changes a pending one); nobody
reviews or awards their own. Submissions are limited per Discord account (3
an hour, 10 a day), duplicates within 30 days are refused, and the queue
stops at 500 pending.

## Merging two accounts (designed, not built)

Someone may have made one account with Discord and another with osu!.
Cascade never guesses they are the same person and never merges on its own.
Linking a claimed identity is refused with "This account is already
connected to another Cascade profile." and changes nothing.

A safe merge, if it is ever built, would need:

1. **Proof of both accounts in one session.** Signed in to account A (fresh,
   within the reauth window) and a fresh reauth ticket proving account B
   through B's provider, completed by the same browser. Neither alone is
   enough.
2. **An explicit choice** of which account survives (its id, name, avatar
   and settings) and a preview of what moves: projects, collaborations,
   presets, friendships, messages, statistics, cards, skins, notifications.
3. **One transaction** (`merge_accounts(p_keep, p_absorb, p_proof)`,
   service role only) that locks both accounts and both identities,
   re-points every `user_id`/`owner`/`author` foreign key from B to A,
   resolves unique conflicts (two friendships with the same person, one
   preset hash), moves B's identities to A, and marks B merged (kept, not
   deleted, with `merged_into = A`) so old links and audit trails resolve.
4. **A cooling-off period** and a notice to both accounts' providers'
   contact points where possible, with an admin-only undo while B still
   exists.
5. **Tests** for every table with a user reference, run against a copy of
   production data before shipping.

Until then, the answer to a duplicate is: use the profile you want, or ask an
admin, who can move maps between accounts by hand.

## Deploying

1. Apply `supabase/migrations/0047_account_identities.sql`, then
   `0048_discord_community.sql`, in the Supabase SQL editor. Both are safe to
   run twice, and the Worker that is live today keeps working with them: it
   still upserts on `osu_id`, and a trigger gives each new account its
   identity.
2. Deploy the Worker and the site (push to master). With
   `DISCORD_APPLICATION_ID` empty, Discord stays off and osu! sign-in runs
   through `auth_sign_in`. A Worker deployed before the migrations falls back
   to the old osu! upsert and reports Discord as unavailable.
3. Set up Discord ([DISCORD_SETUP.md](DISCORD_SETUP.md)).

### Backward compatibility

- Old sessions keep working; they lack `at`, so they confirm once before
  changing sign-in methods.
- Desktop builds from before this change log in with osu! as before (same
  `/auth/osu/login?client=desktop` request, same loopback answer). They have
  no Discord button and no Connected accounts.
- The new desktop page shown after linking ("Back to Cascade") needs the next
  desktop build; until then the browser shows "Signed in to Cascade" for those
  too, and the app shows the real result.
- The `/auth/session` response gains `providers`, `handle`, `profile_provider`
  and `loginProviders`; older app builds ignore them.

### Rolling back

- **Worker and site:** revert the commit and push. The previous Worker runs
  fine against the new schema. Accounts made with Discord can't sign in
  while the old Worker is live (it has no Discord route); nothing is lost.
- **Discord only:** set `DISCORD_APPLICATION_ID` to `""` and push, or delete
  the `DISCORD_CLIENT_SECRET` secret. The Discord buttons disappear; Discord-
  only accounts can't sign in until it is back.
- **Database:** not needed for either of the above. To remove the schema
  anyway, while **no account has a null `osu_id`** (check
  `select count(*) from public.users where osu_id is null` first):

```sql
begin;
drop trigger if exists users_add_osu_identity on public.users;
drop trigger if exists users_guard_identity on public.users;
drop trigger if exists account_identities_attach_contributions on public.account_identities;
drop table if exists public.account_identities, public.auth_used_tokens,
  public.contributions, public.contribution_settings, public.contributor_overrides,
  public.roadmap_items;
alter table public.users drop column if exists profile_provider;
alter table public.users alter column osu_id set not null;
alter table public.social_privacy drop column if exists discord_lookup, drop column if exists leaderboard;
commit;
```

  Then re-run `0041_social.sql`, `0044_admin_mapping_stats.sql` and
  `0046_profile_admin_badge.sql` to restore the functions 0047 and 0048
  replaced (`find_user_id`, `profile_card`, `get_my_privacy`,
  `set_my_privacy`, `add_collaborator`). The new functions left behind are
  unreachable once their tables are gone.

## Known limits

- Sessions are stateless JWTs, as before: logging out clears this device's
  token and cookie, but a copied token stays valid until it expires (30
  days). Server-side revocation would need a per-account session epoch.
- Rate limits are approximate per Cloudflare location, not global.
- Discord names change; a name Cascade chose follows the Discord name only
  when it changes, and may gain a number if another account has it by then.
- Desktop: an error page during linking says "Signed in to Cascade" on
  desktop builds older than the one with the new loopback page.
