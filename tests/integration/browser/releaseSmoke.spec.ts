import { expect, test } from "@playwright/test";
import JSZip from "jszip";

/** Exercise the newly merged surfaces with the real editor and public page. */
test("the desktop overview can zoom, scrub and close without blanking the editor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("mania-editor:prefs", JSON.stringify({ showMapOverview: true })));
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
  zip.file("overview.osu", `osu file format v14
[General]
AudioFilename: song.wav
Mode: 3
[Metadata]
Title: Overview regression
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
    name: "overview.osz", mimeType: "application/zip", buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  const editor = page.getByLabel("Note editor", { exact: true });
  await expect(editor).toBeVisible();
  const overview = page.getByRole("region", { name: "Map overview", exact: true });
  await expect(overview).toBeVisible();
  await overview.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(overview.getByRole("button", { name: "Zoom out", exact: true })).toBeEnabled();
  const chart = overview.getByLabel("Whole map. Click or drag to move the editor there.");
  await chart.click({ position: { x: 30, y: 70 } });
  await expect(editor).toBeVisible();
  await expect.poll(() => editor.evaluate(el => (el as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[3])).toBe(255);
  await overview.getByRole("button", { name: "Hide map overview", exact: true }).click();
  await expect(overview).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mania-editor:prefs")!).showMapOverview)).toBe(false);
  expect(errors).toEqual([]);
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`the public 404 playfield renders and accepts input with motion ${reducedMotion}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion });
    await page.goto("/404.html");
    const canvas = page.locator("[data-playfield]");
    await expect(canvas).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[3])).toBe(255);
    await page.keyboard.press("d");
    await expect(canvas).toBeVisible();
    expect(errors).toEqual([]);
  });
}
