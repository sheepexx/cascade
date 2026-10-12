import { expect, test, type Page } from "@playwright/test";

const DAY = 24 * 60 * 60_000;
const KEY = "cascade:feedback-invite";

/** A mapper who has used Cascade for a while: eligible for an invitation. */
async function openEligible(page: Page, record: Record<string, unknown> = {}) {
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
        ...record,
      }),
    ] as const,
  );
  await page.goto("/?mode=feedback-invite");
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
