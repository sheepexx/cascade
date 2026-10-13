import { expect, test } from "@playwright/test";

/**
 * The menu announces its song in the top-right corner when it opens,
 * osu!-style: once it plays and the intro has lifted, for about four seconds,
 * then it fades away. Later songs aren't announced.
 */
test("opening the menu shows the song's title for a few seconds, then fades it out", async ({ page }) => {
  await page.goto("/?mode=track-title&styled=1");
  const flash = page.getByTestId("track-title-flash");
  const button = (name: string) => page.getByRole("button", { name }).click();

  // Nothing while the intro covers the menu or the song hasn't started.
  await button("Play/pause");
  await page.waitForTimeout(300);
  await expect(flash).toHaveCount(0);
  await button("Lift intro");
  await expect(flash).toContainText("Beta Jack practice pack");
  await expect(flash).toContainText("Various Artists");
  if (process.env.SCREENSHOTS) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/track-title.png` });
  }

  // Still up shortly before four seconds, faded and gone a little after.
  await page.waitForTimeout(3300);
  await expect(flash).toHaveCSS("opacity", "1");
  await expect(flash).toHaveCount(0, { timeout: 3000 });

  // Neither pausing and resuming nor the next song brings it back.
  await button("Play/pause");
  await button("Play/pause");
  await button("Next track");
  await page.waitForTimeout(400);
  await expect(flash).toHaveCount(0);
});
