import { expect, test } from "@playwright/test";

/**
 * The menu announces its song in the top-right corner, osu!-style: when the
 * menu opens and when someone skips to another song while it is open, for
 * about four seconds, then it fades away. Collapsing the menu takes it away.
 */
test("the menu shows the song's title when it opens and on a skip, never while collapsed", async ({ page }) => {
  await page.goto("/?mode=track-title&styled=1");
  const flash = page.getByTestId("track-title-flash");
  const button = (name: string) => page.getByRole("button", { name, exact: true }).click();
  const absent = async () => {
    await page.waitForTimeout(400);
    await expect(flash).toHaveCount(0);
  };

  // Nothing while the menu is collapsed, the intro is up or nothing plays.
  await button("Play/pause");
  await button("Lift intro");
  await absent();
  await button("Skip");
  await absent();
  await button("Play/pause");
  await button("Toggle menu");
  await absent();
  await button("Play/pause");
  await expect(flash).toContainText("Ladyfingers");
  if (process.env.SCREENSHOTS) {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/track-title.png` });
  }

  // Up for about four seconds, then faded and gone.
  await page.waitForTimeout(2500);
  await expect(flash).toHaveCSS("opacity", "1");
  await expect(flash).toHaveCount(0, { timeout: 3000 });

  // A song following on by itself isn't announced; a skip is.
  await button("Song ends");
  await absent();
  await button("Skip");
  await expect(flash).toContainText("Ladyfingers");

  // Collapsing the menu takes it away at once.
  await button("Toggle menu");
  await expect(flash).toHaveCount(0, { timeout: 1000 });

  // Opening it again announces the song again.
  await button("Toggle menu");
  await expect(flash).toContainText("Ladyfingers");
});
