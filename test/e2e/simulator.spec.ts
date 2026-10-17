import { expect, test } from "@playwright/test";

test.describe("simulator UI", () => {
  test("loads with the three panes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /talk to your store/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Store", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inspector", exact: true })).toBeVisible();
    await expect(page.locator("#provider")).toContainText("mock");
  });

  test("answers a low-stock question and shows the tool call", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Low stock" }).click();

    const reply = page.locator(".msg.assistant").last();
    await expect(reply).toContainText(/low/i);
    await expect(page.locator("#trace")).toContainText("list_low_stock");
    await expect(page.locator("#low-stock li").first()).toBeVisible();
  });

  test("ship flow asks for a confirmation, then executes it", async ({ page }) => {
    await page.goto("/");

    const firstPending = page.locator("#pending-orders li").first();
    await expect(firstPending).toBeVisible();
    const orderId = (await firstPending.textContent()).match(/\d+/)[0];

    await page.getByLabel("Message").fill(`Ship order ${orderId} with TCS`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".msg.assistant").last()).toContainText(/say yes|confirm/i);
    await expect(page.locator("#awaiting li").first()).toBeVisible();

    await page.getByLabel("Message").fill("yes");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".msg.assistant").last()).toContainText(/on its way|done/i);
    await expect(page.locator("#audit")).toContainText(/shipped|mark_order_shipped/);
  });
});
