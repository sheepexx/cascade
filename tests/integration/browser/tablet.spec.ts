import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { backend } from "./support";

// A tablet is a touch screen wide enough for the desktop layout, which may
// have no keyboard for Space, F5 or Escape.
test.use({ viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true });
test.beforeEach(async () => { await backend("/__test/reset"); });

async function openEditor(page: Page) {
  await page.goto("/?mode=phone-editor&styled=1");
  await page.getByRole("button", { name: "Skip Cascade intro", exact: true }).click();
  await page.getByRole("button", { name: "Cascade menu", exact: true }).click();
  await page.getByRole("button", { name: "Import map", exact: true }).click();
  const rate = 22050;
  const audio = Buffer.alloc(44 + rate * 20 * 2);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
  const zip = new JSZip();
  zip.file("song.wav", audio);
  zip.file("tablet.osu", `osu file format v14
[General]
AudioFilename: song.wav
Mode: 3
[Metadata]
Title: Tablet test
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
`);
  await page.getByRole("dialog").locator('input[type="file"]').first().setInputFiles({
    name: "tablet.osz", mimeType: "application/zip", buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.getByLabel("Note editor", { exact: true })).toBeVisible();
}

test("a tablet plays the song, and plays, pauses and leaves a playtest, by touch", async ({ page }) => {
  await openEditor(page);
  // The desktop layout, not the phone one.
  await expect(page.getByRole("toolbar", { name: "Editor controls" })).toHaveCount(0);

  await page.getByRole("button", { name: "Play audio", exact: true }).tap();
  await page.getByRole("button", { name: "Pause playback", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Play audio", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Test", exact: true }).tap();
  const back = page.getByRole("button", { name: "Back", exact: true });
  await expect(back).toBeVisible();
  // One box per lane across the bottom half of the screen, as in osu!lazer.
  const lanes = page.getByRole("button", { name: /^Play lane \d$/ });
  await expect(lanes).toHaveCount(4);
  const first = page.getByRole("button", { name: "Play lane 1", exact: true });
  await expect(first).toBeEnabled();
  // The editor's side panel slides away as the playtest starts.
  await expect.poll(async () => (await first.boundingBox())!.x).toBe(0);
  const box = (await first.boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(820, 0);
  expect(box.height).toBeCloseTo(410, 0);
  // Tablets keep the desktop HUD, and are not asked to rotate.
  await expect(page.getByText("Misses", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Turn your phone sideways" })).toHaveCount(0);
  const finger = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger] });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(first).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Pause or resume playtest", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Paused", exact: true })).toBeVisible();
  await back.tap();
  await expect(back).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Test", exact: true })).toBeVisible();
});
