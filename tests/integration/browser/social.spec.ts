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

test("a realtime echo before the send response never duplicates a message", async ({ browser }) => {
  const alice = await user("alice");
  const bob = await user("bob");
  const { data: conversation } = await rpcAs(alice, "open_conversation", { p_user: bob });
  await rpcAs(bob, "send_message", { p_conversation: conversation, p_body: "ready", p_reply_to: null });
  const a = await open(browser, alice, "alice", `/messages/${conversation}`);
  const b = await open(browser, bob, "bob", `/messages/${conversation}`);
  await expect(a.getByRole("log").getByText("ready", { exact: true })).toBeVisible();
  await expect(b.getByRole("log").getByText("ready", { exact: true })).toBeVisible();

  const releases: (() => void)[] = [];
  await a.route("**/rpc", async (route) => {
    if (route.request().postDataJSON().fn !== "send_message") return route.continue();
    // Commit and deliver the realtime event, but hold the HTTP acknowledgement.
    const response = await route.fetch();
    await new Promise<void>((resolve) => releases.push(resolve));
    await route.fulfill({ response });
  });

  const body = "same message twice on purpose";
  const mine = a.getByRole("log").getByText(body, { exact: true });
  const theirs = b.getByRole("log").getByText(body, { exact: true });
  const box = a.getByRole("textbox", { name: "Message bob" });
  try {
    for (let count = 1; count <= 2; count++) {
      await box.fill(body);
      await box.press("Enter");
      await expect.poll(() => releases.length).toBe(count);
      await expect(theirs).toHaveCount(count);
      // A reply through the same realtime stream proves the echo reached Alice.
      const reply = `received ${count}`;
      await rpcAs(bob, "send_message", { p_conversation: conversation, p_body: reply, p_reply_to: null });
      await expect(a.getByRole("log").getByText(reply, { exact: true })).toBeVisible();
      await expect(mine).toHaveCount(count);

      releases[count - 1]();
      await expect(a.getByRole("log").getByRole("button", { name: "Edit", exact: true })).toHaveCount(count);
      await expect(mine).toHaveCount(count);
    }
    await a.reload();
    await expect(mine).toHaveCount(2);
  } finally {
    for (const release of releases) release();
    await a.unrouteAll({ behavior: "wait" });
  }
});

test("two mappers become friends, chat live, and a block stops both sides", async ({ browser }) => {
  const alice = await user("alice");
  const bob = await user("bob");
  await backend("/__test/sql", { sql: "update public.users set is_admin = true where id = $1", params: [bob] });

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
  // Bob runs Cascade, which his profile says.
  await expect(a.getByTitle("Runs Cascade")).toBeVisible();
  await shot(a, "profile-friends");
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

test("messages show avatars, take emoji and reactions live, and show GIFs inline", async ({ browser }) => {
  const alice = await user("alice");
  const bob = await user("bob");
  const conversation = (await rpcAs(alice, "open_conversation", { p_user: bob })).data as string;
  await rpcAs(alice, "send_message", { p_conversation: conversation, p_body: "new map is up", p_reply_to: null });

  const a = await open(browser, alice, "alice", `/messages/${conversation}`);
  const b = await open(browser, bob, "bob", `/messages/${conversation}`);
  const aliceLog = a.getByRole("log");
  const bobLog = b.getByRole("log");
  await expect(bobLog.getByText("new map is up")).toBeVisible();
  // Each run of messages leads with its author, like Discord.
  await expect(bobLog.getByRole("button", { name: "View alice's profile" })).toBeVisible();

  // Bob reacts from the picker; Alice sees it without a reload.
  await bobLog.getByText("new map is up").hover();
  await bobLog.getByRole("button", { name: "Add reaction" }).click();
  const picker = b.getByRole("dialog", { name: "Pick an emoji" });
  await picker.getByRole("searchbox", { name: "Search emoji" }).fill("fire");
  await picker.getByRole("button", { name: "fire", exact: true }).click();
  await expect(picker).toHaveCount(0);
  const aliceFire = aliceLog.getByRole("button", { name: "bob reacted with 🔥" });
  await expect(aliceFire).toHaveText("🔥1");
  await expect(aliceFire).toHaveAttribute("aria-pressed", "false");

  // Alice joins in by clicking the reaction, and Bob takes his back.
  await aliceFire.click();
  await expect(bobLog.getByRole("button", { name: "You, alice reacted with 🔥" })).toHaveText("🔥2");
  await bobLog.getByRole("button", { name: "You, alice reacted with 🔥" }).click();
  await expect(aliceLog.getByRole("button", { name: "You reacted with 🔥" })).toHaveText("🔥1");

  // Emoji from the composer picker go where the caret was.
  const box = b.getByRole("textbox", { name: "Message alice" });
  await box.fill("nice ");
  await b.getByRole("button", { name: "Emoji and GIFs" }).click();
  await shot(b, "emoji-picker");
  await b.getByRole("searchbox", { name: "Search emoji" }).fill("thumbs up");
  await b.getByRole("button", { name: "thumbs up", exact: true }).click();
  // emojibase writes it with a variation selector.
  await expect(box).toHaveValue(/^nice 👍\uFE0F?$/);
  await b.keyboard.press("Escape");
  await box.press("Enter");
  await expect(aliceLog.getByText(/^nice 👍/)).toBeVisible();

  // A KLIPY media URL on its own is a GIF, shown as an image and listed as "GIF".
  const gif = "https://static.klipy.com/ii/test/hello.gif";
  await a.route("https://static.klipy.com/**", (route) =>
    route.fulfill({
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    }),
  );
  await rpcAs(bob, "send_message", { p_conversation: conversation, p_body: gif, p_reply_to: null });
  await expect(aliceLog.getByRole("img", { name: "GIF" })).toHaveAttribute("src", gif);
  await expect(a.getByRole("complementary", { name: "Conversations" })).toContainText("GIF");
  await shot(b, "messages-reactions");
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
  // Every number in a row of tiles sits on one line, even under a label that wraps.
  // Measure together so the overlay's entrance animation cannot move
  // between the two reads.
  const numberTops = await a.getByText("Guest difficulties", { exact: true })
    .or(a.getByText("Nominated", { exact: true }))
    .locator("xpath=following-sibling::div[1]")
    .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().top));
  expect(numberTops).toHaveLength(2);
  expect(numberTops[0]).toBe(numberTops[1]);
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

  // On a narrow screen the activity grid starts on the latest weeks.
  await a.setViewportSize({ width: 560, height: 860 });
  await a.reload();
  const calendar = a.getByRole("grid").first();
  await expect(calendar).toBeVisible();
  const scroller = calendar.locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft))
    .toBeLessThan(2);
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await a.setViewportSize({ width: 1280, height: 860 });

  const page = await a.context().newPage();
  await page.goto(`/?mode=admin-mapping&styled=1&user=${admin}&profile=${bob}&profileName=bob`);
  await expect(page.getByText("Mapping in Cascade")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Secret Song/ })).toBeVisible();
  await expect(page.getByText("120").first()).toBeVisible();
  await shot(page, "admin-mapping");
});
