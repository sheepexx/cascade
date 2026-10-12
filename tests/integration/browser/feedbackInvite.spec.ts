import { expect, test, type Page } from "@playwright/test";
import { backend, rpcAs } from "./support";

const DAY = 24 * 60 * 60_000;
const KEY = "cascade:feedback-invite";

const ALL_ASKED = ["recommend", "reliability", "workflow", "missing"];

/**
 * A mapper who has used Cascade for a while: eligible for an invitation. By
 * default every rating question was already asked, so it's the plain one.
 */
async function openEligible(page: Page, record: Record<string, unknown> = {}, query = "") {
  await page.clock.install({ time: new Date("2026-03-01T12:00:00") });
  const now = new Date("2026-03-01T12:00:00").getTime();
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [
      KEY,
      JSON.stringify({
        firstUsedAt: now - 30 * DAY,
        activeDays: ["2026-02-01", "2026-02-02", "2026-02-03"],
        exported: true,
        quietUntil: null,
        dismissals: 0,
        optedOut: false,
        lastFeedbackAt: null,
        askedRatings: ALL_ASKED,
        ...record,
      }),
    ] as const,
  );
  await page.goto(`/?mode=feedback-invite${query}`);
}

/**
 * The invitation while it is up. Under the test clock a closed toast stays in
 * the page in its exit state, so "gone" means no toast in its "in" state.
 */
const invite = (page: Page) =>
  page.locator('.notification-shell[data-state="in"]', { hasText: "How’s Cascade working for you?" });
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), KEY);

test.describe("feedback invitation", () => {
  test("waits until playback and an open dialog have ended, then appears", async ({ page }) => {
    await openEligible(page);
    await page.getByRole("button", { name: "Toggle playback" }).click();
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(120_000);
    await expect(invite(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Toggle dialog" }).click();
    await page.getByRole("button", { name: "Toggle playback" }).click();
    await page.clock.runFor(120_000);
    await expect(invite(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Toggle dialog" }).click();
    await page.clock.runFor(14_000);
    await expect(invite(page)).toHaveCount(0);
    await page.clock.runFor(2_000);
    await expect(invite(page)).toBeVisible();
    expect((await stored(page)).quietUntil).toBeGreaterThan(Date.parse("2026-03-30"));
  });

  test("can be answered from the keyboard, and Not now is remembered", async ({ page }) => {
    await openEligible(page);
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(16_000);
    await expect(invite(page)).toBeVisible();
    const notNow = page.getByRole("button", { name: "Not now" });
    await notNow.focus();
    await page.keyboard.press("Enter");
    await expect(invite(page)).toHaveCount(0);
    expect((await stored(page)).dismissals).toBe(1);

    // Once a session at most, whatever happens next.
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(120_000);
    await expect(invite(page)).toHaveCount(0);
  });

  test("Share feedback opens the feedback flow; Don't ask again is permanent", async ({ page, context }) => {
    await openEligible(page);
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(16_000);
    await page.getByRole("button", { name: "Share feedback" }).click();
    await expect(page.getByTestId("shared")).toHaveText("1");

    const other = await context.newPage();
    await other.clock.install({ time: new Date("2026-03-01T12:00:00") });
    await other.goto("/?mode=feedback-invite");
    await other.evaluate((key) => {
      const record = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...record, quietUntil: null }));
    }, KEY);
    await other.getByRole("button", { name: "Finish export" }).click();
    await other.clock.runFor(16_000);
    await other.getByRole("button", { name: "Don’t ask again" }).click();
    expect((await stored(other)).optedOut).toBe(true);
  });

  test("doesn't appear for a mapper who opted out or when storage is blocked", async ({ page }) => {
    await openEligible(page, { optedOut: true });
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(120_000);
    await expect(invite(page)).toHaveCount(0);

    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("blocked", "SecurityError");
      };
    });
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    await page.reload();
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(120_000);
    await expect(invite(page)).toHaveCount(0);
  });

  test("has no countdown bar and respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openEligible(page);
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(16_000);
    await expect(invite(page)).toBeVisible();
    await expect(page.locator(".notification-progress, .notification-progress-indeterminate")).toHaveCount(0);
  });
});

const ratings = async () =>
  (
    await backend<{ rows: { user_id: string | null; author_username: string | null; question: string; score: number; comment: string | null }[] }>(
      "/__test/sql",
      { sql: "select user_id, author_username, question, score, comment from public.feedback_ratings order by created_at" },
    )
  ).rows;

test.describe("1-10 rating questions", () => {
  test.beforeEach(() => backend("/__test/reset"));

  test("asks the first question, takes a score and an optional reason from someone signed out", async ({ page }) => {
    await openEligible(page, { askedRatings: [] });
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(16_000);
    const card = page.locator('.notification-shell[data-state="in"]');
    await expect(card).toContainText("How likely are you to recommend Cascade to another mapper?");
    await expect(card.getByRole("button", { name: "Send" })).toHaveCount(0);

    const eight = card.getByRole("button", { name: "8 out of 10" });
    await eight.focus();
    await page.keyboard.press("Enter");
    await expect(eight).toHaveAttribute("aria-pressed", "true");
    await card.getByLabel(/main reason for your score/).fill("Fast, and the playtest is great");
    await card.getByRole("button", { name: "Send" }).click();
    await expect(card).toContainText("Thanks, that helps.");

    expect(await ratings()).toEqual([
      { user_id: null, author_username: null, question: "recommend", score: 8, comment: "Fast, and the playtest is great" },
    ]);
    const record = await stored(page);
    expect(record.askedRatings).toEqual(["recommend"]);
    expect(record.lastFeedbackAt).not.toBeNull();
  });

  test("never asks the same question twice, even after it was dismissed", async ({ page, context }) => {
    await openEligible(page, { askedRatings: [] });
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(16_000);
    await page.getByRole("button", { name: "Not now" }).click();

    // Months later, in a new window: the next question, not the same one.
    const later = await context.newPage();
    await later.clock.install({ time: new Date("2026-08-01T12:00:00") });
    await later.goto("/?mode=feedback-invite");
    await later.evaluate((key) => {
      const record = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...record, dismissals: 0 }));
    }, KEY);
    await later.getByRole("button", { name: "Finish export" }).click();
    await later.clock.runFor(16_000);
    await expect(later.locator('.notification-shell[data-state="in"]')).toContainText(
      "How much do you trust Cascade with your maps",
    );
    expect((await stored(later)).askedRatings).toEqual(["recommend", "reliability"]);
  });

  test("skips what the account already answered on another device, and files the answer under it", async ({ page }) => {
    const user = (await backend<{ id: string }>("/__test/user", { username: "alice" })).id;
    await rpcAs(user, "submit_feedback_rating", { p_question: "recommend", p_score: 9 });
    const checked = page.waitForResponse((response) => response.url().endsWith("/table"));
    await openEligible(page, { askedRatings: [] }, `&user=${user}`);
    await checked;
    await page.getByRole("button", { name: "Finish export" }).click();
    await page.clock.runFor(16_000);
    const card = page.locator('.notification-shell[data-state="in"]');
    await expect(card).toContainText("How much do you trust Cascade with your maps");
    await card.getByRole("button", { name: "3 out of 10" }).click();
    await card.getByRole("button", { name: "Send" }).click();
    await expect(card).toContainText("Thanks, that helps.");
    expect(await ratings()).toEqual([
      { user_id: user, author_username: "alice", question: "recommend", score: 9, comment: null },
      { user_id: user, author_username: "alice", question: "reliability", score: 3, comment: null },
    ]);
  });
});
