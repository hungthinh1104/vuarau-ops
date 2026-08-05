import { expect, signIn, test } from "./harness/signed-in.ts";

function isMobile(page: Parameters<typeof signIn>[0]): boolean {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

test.describe("operational shell and action dock", () => {
  test("keeps mobile navigation on directories and replaces it with the form dock", async ({
    page,
  }) => {
    await signIn(page, "owner");
    await page.goto("/products");

    const mobileNav = page.getByRole("navigation", { name: "Điều hướng di động" });
    if (isMobile(page)) await expect(mobileNav).toBeVisible();

    await page.goto("/products/new");
    await expect(page.getByRole("heading", { name: "Thêm mặt hàng" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Hành động mặt hàng" })).toBeVisible();
    if (isMobile(page)) await expect(mobileNav).toBeHidden();
  });

  test("keeps account actions behind the account menu", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto("/products");

    await page.getByRole("button", { name: "Mở tài khoản" }).click();
    await expect(page.getByRole("button", { name: "Chuyển giao diện" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đổi vựa" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });

  test("does not request advanced report data before its disclosure opens", async ({ page }) => {
    const advancedRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("report.metrics") ||
        request.url().includes("report.intelligence") ||
        request.url().includes("dashboard.salesSeries") ||
        request.url().includes("dashboard.orderStatusCounts") ||
        request.url().includes("dashboard.topProducts")
      ) {
        advancedRequests.push(request.url());
      }
    });

    await signIn(page, "owner");
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Tổng quan vận hành" })).toBeVisible();
    expect(advancedRequests).toHaveLength(0);

    await page.getByRole("button", { name: "Chỉ số nâng cao" }).click();
    await expect.poll(() => advancedRequests.length).toBeGreaterThan(0);
  });
});
