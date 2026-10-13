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

test("a stranger can't start a conversation until the other mapper allows it", async ({ browser }) => {
  const alice = await user("alice");
  const carol = await user("carol");
  const a = await open(browser, alice, "alice", "/user/carol");
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

test("a profile shows osu! statistics, mapping counts and the map library", async ({ browser }) => {
  const alice = await user("alice");
  await user("bob");
  const a = await open(browser, alice, "alice", "/user/bob");
  await expect(a.getByText("osu! statistics")).toBeVisible();
  await expect(a.getByText("#12,345")).toBeVisible();
  await expect(a.getByText("Counts are beatmapsets, not difficulties.", { exact: false })).toBeVisible();
  await shot(a, "profile-overview");

  await a.getByRole("tab", { name: "Maps" }).click();
  await expect(a.getByRole("tab", { name: /All maps/ })).toHaveAttribute("aria-selected", "true");
  await expect(a.getByRole("link", { name: "Ranked Song" })).toBeVisible();
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
