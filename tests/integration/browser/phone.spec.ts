import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { backend } from "./support";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async () => { await backend("/__test/reset"); });

async function openEditor(page: Page, moreVersions: string[] = []) {
  await page.goto("/?mode=phone-editor&styled=1");
  await page.getByRole("button", { name: "Skip Cascade intro", exact: true }).click();
  await page.getByRole("button", { name: "Import map", exact: true }).click();
  const zip = new JSZip();
  // A short, valid WAV in an archive gives the editor real decoded audio.
  const rate = 22050, samples = rate * 20;
  const audio = Buffer.alloc(44 + samples * 2);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(samples * 2, 40);
  zip.file("song.wav", audio);
  const osu = `osu file format v14
[General]
AudioFilename: song.wav
Mode: 3
[Metadata]
Title: Phone test
Artist: Fixture
Creator: Tester
Version: Normal
[Difficulty]
CircleSize: 4
OverallDifficulty: 8
HPDrainRate: 5
[TimingPoints]
0,500,4,2,1,100,1,0
[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,1500,1,0,0:0:0:0:
320,192,2000,128,0,2750:0:0:0:0:
`;
  zip.file("phone.osu", osu);
  for (const version of moreVersions) zip.file(`${version}.osu`, osu.replace("Version: Normal", `Version: ${version}`));
  await page.getByRole("dialog").locator('input[type="file"]').first().setInputFiles({ name: "phone.osz", mimeType: "application/zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) });
  await expect(page.getByRole("toolbar", { name: "Editor controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play audio", exact: true })).toBeEnabled();
}

async function command(page: Page, label: string) {
  await page.getByRole("button", { name: "All tools", exact: true }).last().click();
  const menu = page.getByRole("dialog", { name: "All tools", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("searchbox", { name: "Search actions and settings" }).fill(label);
  await menu.getByRole("button", { name: label, exact: true }).first().click();
  await expect(menu).not.toBeVisible();
}

/** Lets a sheet finish sliding in, so a tap inside it does not land mid-move. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => undefined))));
}

async function noteCount(page: Page) {
  await page.getByRole("button", { name: "Difficulties", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Difficulties", exact: true });
  const value = await panel.getByText("Notes", { exact: true }).locator("xpath=following-sibling::span").textContent();
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  return Number(value);
}

test("phone tools, touch editing and sheets preserve the full canvas", async ({ page }) => {
  await openEditor(page);
  const canvas = page.getByLabel("Note editor", { exact: true });
  await expect(canvas).toBeVisible();
  const fullWidth = await canvas.evaluate(el => el.clientWidth);
  expect(fullWidth).toBeGreaterThan(370);
  await command(page, "Select all notes");
  await page.getByRole("button", { name: "Edit selection", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit selection", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Mirror", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  expect(await canvas.evaluate(el => el.clientWidth)).toBe(fullWidth);
  await command(page, "Clear selection");

  // Native touch events, including pointer capture and the compatibility
  // mouse events the browser might otherwise send after a finger lifts.
  const cdp = await page.context().newCDPSession(page);
  const rect = (await canvas.boundingBox())!;
  const x = rect.x + rect.width * 0.875, y = rect.y + rect.height * 0.35;
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await noteCount(page)).toBe(4);
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await noteCount(page)).toBe(3);
  expect(await canvas.evaluate(el => el.clientWidth)).toBe(fullWidth);

  await command(page, "Focus mode");
  await expect(page.getByRole("button", { name: "Choose editing tool", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose editing tool", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move", exact: true }).click();
  await command(page, "Show all controls");
  await expect(page.getByRole("button", { name: "Note", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("html")).toHaveAttribute("data-phone", "");
  await expect(page.getByRole("toolbar", { name: "Editor controls" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
});

test("all editing menus are reachable and fit a narrow phone", async ({ page }) => {
  await openEditor(page);
  await page.setViewportSize({ width: 320, height: 740 });
  for (const label of ["Map Settings", "Timing", "SV", "Difficulty", "Tools", "AiMod", "Skin", "Settings", "Clipboard & paste", "Hitsound", "Playfield controls", "Timeline & markers", "Statistics & graphs"]) {
    await command(page, label);
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
    expect(box.y + box.height).toBeLessThanOrEqual(741);
    await dialog.locator('button[aria-label="Close"]').click();
  }
  await command(page, "Pack creator");
  await expect(page.getByRole("button", { name: "Pack settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pack settings", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("button", { name: /Back/ }).first().click();
  await expect(page.getByRole("toolbar", { name: "Editor controls" })).toBeVisible();
});

test("pinch never places notes, and long notes can be placed and retimed on touch", async ({ page }) => {
  await openEditor(page);
  const canvas = page.getByLabel("Note editor", { exact: true });
  const cdp = await page.context().newCDPSession(page);
  const rect = (await canvas.boundingBox())!;
  const x = rect.x + rect.width * .875, y = rect.y + rect.height * .35;
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x, y }, { id: 2, x: x - 100, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x, y: y - 50 }, { id: 2, x: x - 100, y: y + 50 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x, y: y - 50 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await noteCount(page)).toBe(3);
  await page.getByRole("button", { name: "Playback & snap", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/Timeline zoom:/)).not.toHaveText("Timeline zoom: 25");
  await page.getByRole("dialog").locator('button[aria-label="Close"]').click();

  // Hold placement commits once on release, after the finger has dragged.
  const now = (await canvas.boundingBox())!;
  const hx = now.x + now.width * .875, hy = now.y + now.height * .55;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: hx, y: hy }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: hx, y: hy - 180 }] });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await noteCount(page)).toBe(4);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width * .78, y: box.y + box.height * .1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * .98, y: box.y + box.height * .85 }] });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.getByRole("button", { name: "Edit selection", exact: true }).click();
  const selection = page.getByRole("dialog", { name: "Edit selection", exact: true });
  const end = selection.getByRole("textbox", { name: "End", exact: true });
  const originalEnd = Number(await end.inputValue());
  await end.fill(String(originalEnd + 500));
  await selection.getByRole("textbox", { name: "Start", exact: true }).click();
  await expect(end).toHaveValue(String(originalEnd + 500));
  await selection.locator('button[aria-label="Close"]').click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await noteCount(page)).toBe(3);
});

test("playtest accepts chords, releases fingers independently and clears input on pause", async ({ page }) => {
  await openEditor(page);
  await command(page, "Start playtest");
  const one = page.getByRole("button", { name: "Play lane 1", exact: true });
  const two = page.getByRole("button", { name: "Play lane 2", exact: true });
  await expect(one).toBeEnabled();
  const a = (await one.boundingBox())!, b = (await two.boundingBox())!;
  const p1 = { id: 1, x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const p2 = { id: 2, x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p1, p2] });
  await expect(one).toHaveAttribute("aria-pressed", "true");
  await expect(two).toHaveAttribute("aria-pressed", "true");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [p1] });
  await expect(one).toHaveAttribute("aria-pressed", "false");
  await expect(two).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pause or resume playtest", exact: true }).click();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.getByRole("button", { name: "Pause or resume playtest", exact: true }).click();
  await expect(one).toBeEnabled();
  await expect(one).toHaveAttribute("aria-pressed", "false");
  await expect(two).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Editor controls" })).toBeVisible();
});

test("selection, clipboard, hitsounds and timeline actions work from phone sheets", async ({ page }) => {
  await openEditor(page);
  await command(page, "Select all notes");
  await command(page, "Cut selection");
  expect(await noteCount(page)).toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await noteCount(page)).toBe(3);
  await command(page, "Clipboard & paste");
  const clipboard = page.getByRole("dialog", { name: "Clipboard & paste", exact: true });
  await clipboard.getByRole("button", { name: "Paste at playhead", exact: true }).click();
  await clipboard.locator('button[aria-label="Close"]').click();
  expect(await noteCount(page)).toBe(6);
  await command(page, "Select all notes");
  await command(page, "Hitsound");
  const hitsound = page.getByRole("dialog", { name: "Hitsound", exact: true });
  await hitsound.getByRole("button", { name: "Whistle", exact: true }).click();
  await expect(hitsound.getByRole("button", { name: "Whistle", exact: true })).toHaveAttribute("aria-pressed", "true");
  await hitsound.locator('button[aria-label="Close"]').click();
  await command(page, "Timeline & markers");
  const timeline = page.getByRole("dialog", { name: "Timeline & markers", exact: true });
  await timeline.getByLabel("Fade in (ms)", { exact: true }).fill("500");
  await timeline.getByLabel("Fade out (ms)", { exact: true }).click();
  await expect(timeline.getByLabel("Fade in (ms)", { exact: true })).toHaveValue("500");
  await timeline.getByRole("button", { name: "Reset trim & fades", exact: true }).click();
  await expect(timeline.getByLabel("Fade in (ms)", { exact: true })).toHaveValue("0");
  await timeline.locator('button[aria-label="Close"]').click();
  await command(page, "Save locally");
  await expect(page.getByRole("button", { name: "Save locally", exact: true })).toContainText("Saved");
  const downloaded = page.waitForEvent("download");
  await command(page, "Export .osu");
  const validation = page.getByRole("dialog", { name: "Before exporting", exact: true });
  if (await validation.isVisible()) await validation.getByRole("button", { name: "Export .osu", exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const objects = Buffer.concat(chunks).toString().split("[HitObjects]")[1].trim().split(/\r?\n/);
  expect(objects).toHaveLength(6);
  expect(objects.every(line => line.split(",")[4] === "2")).toBe(true);
});

test("account and social navigation remain reachable in phone landscape", async ({ page }) => {
  const { id } = await backend<{ id: string }>("/__test/user", { username: "phone_mapper" });
  await backend("/__test/sql", { sql: "update public.feature_flags set enabled = true where key = 'social'" });
  await page.addInitScript(() => localStorage.setItem("mania:featureFlags", JSON.stringify({ social: true })));
  await page.goto(`/?mode=phone-editor&styled=1&user=${id}&name=phone_mapper`);
  await page.getByRole("button", { name: "Skip Cascade intro", exact: true }).click();
  await page.getByRole("button", { name: "All tools", exact: true }).last().click();
  await page.getByRole("dialog", { name: "All tools", exact: true }).getByRole("button", { name: "Friends and messages", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Friends", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Social", exact: true }).getByRole("button", { name: "Messages", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Conversations", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".message-workspace > section")).toBeHidden();
  expect(await page.getByRole("navigation", { name: "Social", exact: true }).evaluate(el => getComputedStyle(el).flexDirection)).toBe("row");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
  await page.getByRole("dialog", { name: "Messages", exact: true }).getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "Messages", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "All tools", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "All tools", exact: true })).toBeVisible();
});

test("phone sheets stay inside the visible viewport when the keyboard reduces its height", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "All tools", exact: true }).last().click();
  // Desktop automation cannot open an OS keyboard: emulate its visual viewport
  // resize while retaining the phone's layout viewport.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 430 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  const menu = page.getByRole("dialog", { name: "All tools", exact: true });
  await expect(page.locator("html")).toHaveCSS("--phone-height", "430px");
  await expect.poll(async () => { const rect = (await menu.boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(431);
  await menu.getByRole("searchbox").fill("Settings");
  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await expect.poll(async () => { const rect = (await page.getByRole("dialog", { name: "Settings", exact: true }).boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(431);
});

test("the phone start screen fits one screen and the menu's popovers stay on it", async ({ page }) => {
  const { id } = await backend<{ id: string }>("/__test/user", { username: "phone_mapper" });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/?mode=phone-editor&styled=1&user=${id}&name=phone_mapper`);
  await page.getByRole("button", { name: "Skip Cascade intro", exact: true }).click();
  const importMap = page.getByRole("button", { name: "Import map", exact: true });
  await expect(importMap).toBeVisible();
  // No song picture behind the actions and no page copy below them.
  expect(await importMap.evaluate(el => { const scroller = el.closest(".overflow-y-auto")!; return scroller.scrollHeight - scroller.clientHeight; })).toBeLessThanOrEqual(0);
  await expect(page.getByRole("heading", { name: "Free Online osu!mania Editor & Map Viewer" })).toHaveCount(0);
  await expect(page.locator('[style*="background-image: url"]')).toHaveCount(0);

  await page.getByRole("button", { name: "All tools", exact: true }).last().click();
  const menu = page.getByRole("dialog", { name: "All tools", exact: true });
  await expect(menu).toBeVisible();
  await settle(page);
  const account = page.locator(".account-popover");
  for (const [trigger, popover] of [
    [menu.getByRole("button", { name: "Language", exact: true }), page.getByRole("menu")],
    [menu.getByRole("button", { name: /Notifications/ }).first(), page.getByRole("dialog", { name: "Notification inbox", exact: true })],
    [menu.getByRole("button", { name: "phone_mapper" }), account],
  ] as const) {
    await trigger.click();
    await expect(popover).toBeVisible();
    await settle(page);
    const box = (await popover.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    if (popover === account) {
      await expect(account.getByText("Feedback", { exact: true })).toBeVisible();
      await expect(account.getByText("My Maps", { exact: true })).toHaveCount(0);
      await expect(account.getByText("Presets", { exact: true })).toHaveCount(0);
    }
    await trigger.click();
    await expect(popover).toBeHidden();
  }
});

test("difficulties sit side by side and are renamed from the bar under them", async ({ page }) => {
  await openEditor(page, ["Hard"]);
  await page.getByRole("button", { name: "Difficulties", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Difficulties", exact: true });
  const cards = panel.locator('[role="button"][aria-pressed]');
  await expect(cards).toHaveCount(2);
  await settle(page);
  const [first, second] = [(await cards.nth(0).boundingBox())!, (await cards.nth(1).boundingBox())!];
  expect(second.y).toBe(first.y);
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
  await panel.getByRole("button", { name: "Rename", exact: true }).click();
  await panel.getByRole("textbox", { name: "Rename", exact: true }).fill("Expert");
  await panel.getByRole("textbox", { name: "Rename", exact: true }).press("Enter");
  await expect(page.getByText("Expert · 4K", { exact: true })).toBeVisible();
});
