import { expect, test, type Page } from "@playwright/test";

/** The dropdown's own trigger, which reopens the list and takes focus back. */
const trigger = (page: Page, name: string) =>
  page.locator(`button[aria-haspopup="listbox"][aria-label="${name}"]`);

test.describe("dropdown keyboard selection", () => {
  test("can't choose WASAPI exclusive in audio setup with the keyboard in a browser", async ({ page }) => {
    await page.goto("/?mode=audio-setup");
    const mode = page.getByTestId("mode");
    await trigger(page, "Output mode").click();
    const exclusive = page.getByRole("option", { name: /WASAPI exclusive/ });
    await expect(exclusive).toBeDisabled();
    // The list opens with the current choice focused.
    await expect(page.getByRole("option", { name: /Shared audio/ })).toBeFocused();

    for (const key of ["ArrowDown", "End", "ArrowDown", "Home", "ArrowUp"]) {
      await page.keyboard.press(key);
      await expect(mode).toHaveText("shared");
    }
    await expect(page.getByRole("option", { name: /Shared audio/ })).toHaveAttribute("aria-selected", "true");

    await exclusive.click({ force: true });
    await expect(mode).toHaveText("shared");
  });

  test("skips disabled rows with the arrow keys, Home and End", async ({ page }) => {
    await page.goto("/?mode=dropdown&list=mixed");
    const value = page.getByTestId("value");
    await expect(value).toHaveText("b");
    await trigger(page, "Test list").click();
    await page.keyboard.press("ArrowDown");
    await expect(value).toHaveText("d");
    await page.keyboard.press("ArrowDown");
    await expect(value).toHaveText("e");
    await page.keyboard.press("ArrowDown");
    await expect(value).toHaveText("e");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(value).toHaveText("b");
    await page.keyboard.press("ArrowUp");
    await expect(value).toHaveText("b");
    await page.keyboard.press("End");
    await expect(value).toHaveText("e");
    await page.keyboard.press("Home");
    await expect(value).toHaveText("b");
    await expect(page.getByRole("option", { name: "Bravo" })).toHaveAttribute("aria-selected", "true");

    // Enter closes the list and hands focus back to the field.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(trigger(page, "Test list")).toBeFocused();
  });

  for (const list of ["disabled", "empty"]) {
    test(`leaves the value alone in a list that is ${list === "empty" ? "empty" : "all disabled"}`, async ({ page }) => {
      await page.goto(`/?mode=dropdown&list=${list}&value=keep`);
      const value = page.getByTestId("value");
      await trigger(page, "Test list").click();
      await expect(page.getByRole("listbox")).toBeAttached();
      for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
        await page.keyboard.press(key);
        await expect(value).toHaveText("keep");
      }
      await page.keyboard.press("Escape");
      await expect(page.getByRole("listbox")).toHaveCount(0);
    });
  }
});
