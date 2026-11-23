import { expect, test, type Browser } from "@playwright/test";
import { backend } from "./support";

/**
 * Accounts made with Discord, with no osu! account: everything in Cascade
 * that doesn't need osu! works, and nothing pretends to have osu! data.
 */

async function open(browser: Browser, id: string, name: string, route: string, osu?: "none") {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[${name}]`, error));
  const query = new URLSearchParams({ mode: "social", styled: "1", user: id, name, label: name, route, ...(osu ? { osu } : {}) });
  await page.goto(`/?${query}`);
  return page;
}

test.beforeEach(async () => {
  await backend("/__test/reset");
});

test("a profile without osu! shows Cascade's side and offers to connect osu! to its owner only", async ({ browser }) => {
  const nelly = (await backend<{ id: string }>("/__test/discord-user", { username: "Nelly", discordId: "80351110224678912" })).id;
  const bob = (await backend<{ id: string }>("/__test/user", { username: "bob" })).id;

  const own = await open(browser, nelly, "Nelly", "/user/Nelly", "none");
  await expect(own.getByRole("heading", { name: "Nelly" })).toBeVisible();
  await expect(own.getByText("No osu! account connected")).toBeVisible();
  await expect(own.getByRole("button", { name: "Connect osu!" })).toBeVisible();
  await expect(own.getByText("Mapping on osu!")).toHaveCount(0);
  await expect(own.getByText("osu! player")).toHaveCount(0);
  await own.getByRole("button", { name: "More actions" }).click();
  await expect(own.getByRole("menuitem", { name: "View on osu!" })).toHaveCount(0);

  const visitor = await open(browser, bob, "bob", "/user/Nelly");
  await expect(visitor.getByRole("heading", { name: "Nelly" })).toBeVisible();
  await expect(visitor.getByText("No osu! account connected")).toHaveCount(0);
  await expect(visitor.getByRole("button", { name: "Add friend" })).toBeVisible();
  await visitor.getByRole("button", { name: "More actions" }).click();
  await expect(visitor.getByRole("menuitem", { name: "View on osu!" })).toHaveCount(0);
  await expect(visitor.getByRole("menuitem", { name: "Copy profile link" })).toBeVisible();
});

test("a Discord account sharing a name with an osu! account keeps its own profile", async ({ browser }) => {
  const discordSheep = (await backend<{ id: string }>("/__test/discord-user", { username: "sheep", discordId: "80351110224678912" })).id;
  const osuSheep = (await backend<{ id: string }>("/__test/user", { username: "sheep" })).id;
  // The name leads to the account osu! vouches for...
  const byName = await open(browser, osuSheep, "sheep", "/user/sheep");
  await expect(byName.getByText("Mapping on osu!")).toBeVisible();
  // ...and the other account's link, its id, still opens it.
  const byId = await open(browser, osuSheep, "sheep", `/user/${discordSheep}`);
  await expect(byId.getByRole("heading", { name: "sheep" })).toBeVisible();
  await expect(byId.getByRole("button", { name: "Add friend" })).toBeVisible();
  await expect(byId.getByText("Mapping on osu!")).toHaveCount(0);
});
