import { expect, test } from "@playwright/test";
import { backend, rpcAs } from "./support";

test("admins see ratings summed up per question, and each account's on its page", async ({ page }) => {
  await backend("/__test/reset");
  const admin = (await backend<{ id: string }>("/__test/user", { username: "admin" })).id;
  const alice = (await backend<{ id: string }>("/__test/user", { username: "alice" })).id;
  await backend("/__test/sql", { sql: "update public.users set is_admin = true where id = $1", params: [admin] });
  await rpcAs(alice, "submit_feedback_rating", { p_question: "recommend", p_score: 9, p_comment: "Playtest is great", p_app_version: "1.2.440", p_platform: "web" });
  await rpcAs(alice, "submit_feedback_rating", { p_question: "reliability", p_score: 4, p_comment: "Lost an export once" });
  const anonymous = await fetch("http://127.0.0.1:54329/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn: "submit_feedback_rating", args: { p_question: "recommend", p_score: 6, p_platform: "desktop" } }),
  });
  expect((await anonymous.json()).error).toBeUndefined();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?mode=admin-ratings&styled=1&user=${admin}&profile=${alice}`);
  const recommend = page.getByRole("button", { name: /recommend Cascade/ });
  await expect(recommend).toContainText("7.5");
  await expect(recommend).toContainText("2 answers");
  await expect(page.getByRole("img", { name: /6: 1, 7: 0, 8: 0, 9: 1/ })).toBeVisible();
  await expect(page.getByText("Signed out")).toBeVisible();
  await expect(page.getByText("Playtest is great").first()).toBeVisible();

  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/admin-overview.png`, fullPage: true });
  await page.getByRole("button", { name: /trust Cascade/ }).click();
  await expect(page.getByText("Lost an export once").first()).toBeVisible();

  const profile = page.locator("section").filter({ hasText: "No ratings from this account" }).or(page.locator("section").last());
  await expect(profile).toContainText("Lost an export once");
  await expect(profile).toContainText("Playtest is great");
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/admin-ratings.png`, fullPage: true });
});
