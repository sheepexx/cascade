import { expect, test, type Browser, type Page } from "@playwright/test";
import { backend, rpcAs } from "./support";

/**
 * Profiles, friends and messages through the real overlay, in one browser
 * context per person, against the migrations' functions and row-level
 * security. Messages travel over the backend's Postgres Changes, which only
 * deliver rows the receiving window may read.
 */

async function user(username: string) {
  return (await backend<{ id: string }>("/__test/user", { username })).id;
}

async function open(browser: Browser, id: string, name: string, route: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[${name}]`, error));
  const query = new URLSearchParams({ mode: "social", styled: "1", user: id, name, label: name, route });
  await page.goto(`/?${query}`);
  return page;
}

const shot = async (page: Page, name: string) => {
  if (!process.env.SCREENSHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.SCREENSHOTS}/${name}.png` });
};

test.beforeEach(async () => {
  await backend("/__test/reset");
});

test("two mappers become friends, chat live, and a block stops both sides", async ({ browser }) => {
  const alice = await user("alice");
  const bob = await user("bob");

  const a = await open(browser, alice, "alice", "/user/bob");
  await expect(a.getByRole("heading", { name: "bob" })).toBeVisible();
  await shot(a, "profile-stranger");
  await a.getByRole("button", { name: "Add friend" }).click();
  await expect(a.getByRole("button", { name: "Request sent" })).toBeVisible();

  const b = await open(browser, bob, "bob", "/friends/pending");
  const request = b.getByRole("listitem").filter({ hasText: "alice" });
  await expect(request).toBeVisible();
  await expect(b.getByTestId("counts")).toHaveText("0/1");
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(b.getByText("You’re now friends.")).toBeVisible();

  // Alice's profile view of Bob now offers a conversation.
  await a.reload();
  await expect(a.getByText("Friends", { exact: true }).first()).toBeVisible();
  await a.getByRole("button", { name: "Message", exact: true }).click();
  const aliceBox = a.getByRole("textbox", { name: "Message bob" });
  await aliceBox.fill("hi bob, want to collab on a 7K map?");
  await aliceBox.press("Enter");
  await expect(a.getByRole("log").getByText("hi bob, want to collab on a 7K map?")).toBeVisible();
  await expect(a.getByRole("complementary", { name: "Conversations" })).toContainText("You: hi bob");

  await b.getByRole("button", { name: "Refresh counts" }).click();
  await expect(b.getByTestId("counts")).toHaveText("1/0");
  await b.getByRole("navigation", { name: "Social" }).getByRole("button", { name: /Messages/ }).click();
  await b.getByRole("button", { name: /alice/ }).first().click();
  await expect(b.getByRole("log").getByText("hi bob, want to collab on a 7K map?")).toBeVisible();

  const bobBox = b.getByRole("textbox", { name: "Message alice" });
  await bobBox.fill("sure! https://osu.ppy.sh/beatmapsets/1");
  await bobBox.press("Enter");
  // Arrives in Alice's open conversation without a reload.
  await expect(a.getByRole("log").getByText("sure!")).toBeVisible();
  await expect(a.getByRole("complementary", { name: "Conversations" })).toContainText("sure!");
  await expect(a.getByRole("log").getByRole("link", { name: "https://osu.ppy.sh/beatmapsets/1" })).toHaveAttribute(
    "rel",
    /noopener/,
  );
  await shot(a, "messages");

  // Bob blocks Alice from the conversation menu: neither can send any more.
  await b.getByRole("button", { name: "Conversation actions" }).click();
  await b.getByRole("menuitem", { name: "Block" }).click();
  await expect(b.getByText("You can’t reply to this conversation.")).toBeVisible();
  await a.reload();
  await a.getByRole("button", { name: /bob/ }).first().click();
  await expect(a.getByText("You can’t reply to this conversation.")).toBeVisible();
  await expect(a.getByRole("log").getByText("sure!")).toBeVisible();
  const refused = await rpcAs(alice, "send_message", {
    p_conversation: (await rpcAs(alice, "open_conversation", { p_user: bob })).data,
    p_body: "please",
    p_reply_to: null,
  });
  expect(refused.error?.message).toMatch(/can't send/);
});

test("anyone can message a mapper unless they turn messages off", async ({ browser }) => {
  const alice = await user("alice");
  const carol = await user("carol");
  const a = await open(browser, alice, "alice", "/user/carol");
  await expect(a.getByRole("heading", { name: "carol" })).toBeVisible();
  await expect(a.getByRole("button", { name: "Message", exact: true })).toBeVisible();

  await rpcAs(carol, "set_my_privacy", { p_settings: { messages: "nobody" } });
  await a.reload();
  await expect(a.getByRole("heading", { name: "carol" })).toBeVisible();
  await expect(a.getByRole("button", { name: "Message", exact: true })).toHaveCount(0);

  await rpcAs(carol, "set_my_privacy", { p_settings: { messages: "everyone" } });
  await a.reload();
  await expect(a.getByRole("button", { name: "Message", exact: true })).toBeVisible();
});

test("search finds mappers and the friend button follows the relationship", async ({ browser }) => {
  const alice = await user("alice");
  await user("bobby");
  await user("bobcat");
  const a = await open(browser, alice, "alice", "/friends/add");
  await a.getByRole("searchbox", { name: "Search people" }).fill("bob");
  const rows = a.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: "bobby" }).getByRole("button", { name: "Add friend" }).click();
  await expect(rows.filter({ hasText: "bobby" }).getByRole("button", { name: "Request sent" })).toBeVisible();
  await expect(rows.filter({ hasText: "bobcat" }).getByRole("button", { name: "Add friend" })).toBeVisible();
});

test("a profile leads with mapping, shows badges up top and imports maps", async ({ browser }) => {
  const alice = await user("alice");
  await user("bob");
  const a = await open(browser, alice, "alice", "/user/bob");
  await expect(a.getByRole("heading", { name: "bob" })).toBeVisible();
  await expect(a.getByRole("list", { name: "Badges" }).getByLabel("Winner of the Fixture Mapping Contest")).toBeVisible();
  await expect(a.getByText("Mapping on osu!")).toBeVisible();
  await expect(a.getByText("osu! player")).toBeVisible();
  await expect(a.getByText("#12,345")).toBeVisible();
  await expect(a.getByText("4,568pp")).toBeVisible();
  await expect(a.getByText("Counts are beatmapsets, not difficulties.", { exact: false })).toBeVisible();
  await expect(a.getByText("Accuracy")).toHaveCount(0);
  await shot(a, "profile-overview");

  await a.getByRole("button", { name: "See maps" }).click();
  await expect(a.getByRole("tab", { name: /All maps/ })).toHaveAttribute("aria-selected", "true");
  const ranked = a.getByRole("article").filter({ hasText: "Ranked Song" });
  await ranked.getByRole("button", { name: "Import" }).click();
  await expect(a.getByTestId("imported")).toHaveText("1");
  await a.getByRole("tab", { name: /Qualified/ }).click();
  await expect(a.getByRole("link", { name: "Qualified Song" })).toBeVisible();
  await expect(a.getByRole("link", { name: "Ranked Song" })).toHaveCount(0);
  await a.getByRole("tab", { name: /All maps/ }).click();
  await a.getByRole("searchbox", { name: "Search maps" }).fill("old");
  await expect(a.getByRole("link", { name: "Old One" })).toBeVisible();
  await expect(a.getByRole("link", { name: "Loved Song" })).toHaveCount(0);
  await shot(a, "profile-maps");

  await a.getByRole("tab", { name: "Activity" }).click();
  await expect(a.getByText("This mapper keeps their Cascade statistics private.")).toBeVisible();
});

test("the community page shows every mapper's ranked map count", async ({ browser }) => {
  const alice = await user("alice");
  await user("bob");
  await user("carol");
  await backend("/__test/sql", { sql: "update public.users set last_signed_in_at = now()" });
  const a = await open(browser, alice, "alice", "/community");
  const recent = a.locator("section").filter({ hasText: "Recently active" });
  await expect(recent.getByRole("listitem")).toHaveCount(2);
  await expect(recent.getByText("2 ranked maps")).toHaveCount(2);
  await shot(a, "community");
});

test("admins see a mapper's private statistics, on the profile and in the admin panel", async ({ browser }) => {
  const admin = await user("admin");
  const bob = await user("bob");
  await backend("/__test/sql", { sql: "update public.users set is_admin = true where id = $1", params: [admin] });
  const now = Date.now();
  await rpcAs(bob, "record_mapping_activity", {
    p_session: "33333333-3333-4333-8333-333333333333",
    p_entries: [
      {
        day: new Date(now).toISOString().slice(0, 10),
        project_key: "local:abc",
        project_title: "Secret Song",
        project_artist: "Artist",
        difficulty_key: "d1",
        difficulty_name: "Insane",
        edit: 90,
        playtest: 0,
        review: 0,
        notes_placed: 120,
        maps_created: 1,
      },
    ],
    p_from: new Date(now - 95_000).toISOString(),
    p_to: new Date(now - 5_000).toISOString(),
  });

  const a = await open(browser, admin, "admin", "/user/bob/activity");
  await expect(a.getByText("Admin view")).toBeVisible();
  await expect(a.getByText("1m", { exact: true }).first()).toBeVisible();
  await expect(a.getByText("Secret Song")).toBeVisible();
  await shot(a, "admin-profile");

  const page = await a.context().newPage();
  await page.goto(`/?mode=admin-mapping&styled=1&user=${admin}&profile=${bob}&profileName=bob`);
  await expect(page.getByText("Mapping in Cascade")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Secret Song/ })).toBeVisible();
  await expect(page.getByText("120").first()).toBeVisible();
  await shot(page, "admin-mapping");
});
