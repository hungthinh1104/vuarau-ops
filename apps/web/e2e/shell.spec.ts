import { expect, test } from "@playwright/test";

/**
 * The only end-to-end assertions worth making at this milestone: the app boots,
 * and the shell says which depot is being written into.
 *
 * Everything else a real suite will check — creating a customer, posting a sale,
 * recording a payment, meeting a version conflict — needs screens that do not
 * exist. Writing those specs now would mean asserting against fixtures through a
 * browser, which is a slower version of the component tests and proves less.
 *
 * These run only when a dev server is up (`pnpm --filter @vuarau/web e2e`).
 * `pnpm verify` runs `e2e:check`, which lists them without launching a browser.
 */
test.describe("shell", () => {
  test("the home page states what is and is not built", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Vựa Rau — sổ vựa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chưa có" })).toBeVisible();
  });

  test("the demonstration route names the workspace being written into", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByText("Đang ghi vào")).toBeVisible();
    // A sales worker may post but never void — the capability rule, end to end.
    await expect(page.getByRole("button", { name: "Chốt đơn" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Hoàn tác đơn" })).toBeDisabled();
  });
});
