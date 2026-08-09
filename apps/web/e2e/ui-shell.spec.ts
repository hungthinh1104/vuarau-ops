import { expect, signIn, test } from "./harness/signed-in.ts";

function isMobile(page: Parameters<typeof signIn>[0]): boolean {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

async function expectNoHorizontalOverflow(page: Parameters<typeof signIn>[0]): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

test.describe("operational shell and action dock", () => {
  test("keeps specimen screens readable across the supported viewport widths", async ({ page }) => {
    await signIn(page, "owner");
    const mobileNav = page.getByRole("navigation", { name: "Điều hướng di động" });

    for (const width of [360, 390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/products");
      await expect(page.getByRole("heading", { name: "Mặt hàng" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      if (width < 1024) await expect(mobileNav).toBeVisible();

      await page.goto("/products/new");
      await expect(page.getByRole("heading", { name: "Thêm mặt hàng" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const actionDock = page.getByRole("region", { name: "Hành động mặt hàng" });
      await expect(actionDock).toBeVisible();
      const primary = actionDock.getByRole("button", { name: /Tạo mặt hàng|Đang tạo/ });
      const box = await primary.boundingBox();
      expect(box).not.toBeNull();
      if (box !== null) expect(box.y + box.height).toBeLessThanOrEqual(900);
      if (width < 1024) await expect(mobileNav).toBeHidden();
    }
  });

  test("keeps mobile navigation on directories and replaces it with the form dock", async ({
    page,
  }) => {
    await signIn(page, "owner");
    await page.goto("/products");
    await expectNoHorizontalOverflow(page);

    const mobileNav = page.getByRole("navigation", { name: "Điều hướng di động" });
    if (isMobile(page)) await expect(mobileNav).toBeVisible();

    await page.goto("/products/new");
    await expect(page.getByRole("heading", { name: "Thêm mặt hàng" })).toBeVisible();
    const actionDock = page.getByRole("region", { name: "Hành động mặt hàng" });
    await expect(actionDock).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const primaryButton = actionDock.getByRole("button", { name: /Tạo mặt hàng|Đang tạo/ });
    const primaryBox = await primaryButton.boundingBox();
    expect(primaryBox).not.toBeNull();
    if (primaryBox !== null) {
      expect(primaryBox.y + primaryBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
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
    const dashboardRequests: string[] = [];
    const managementRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.url().includes("dashboard.salesSeries") ||
        request.url().includes("dashboard.orderStatusCounts") ||
        request.url().includes("dashboard.topProducts")
      ) {
        dashboardRequests.push(request.url());
      }
      if (
        request.url().includes("report.metrics") ||
        request.url().includes("report.intelligence")
      ) {
        managementRequests.push(request.url());
      }
    });

    await signIn(page, "owner");
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Tổng quan vận hành" })).toBeVisible();
    expect(dashboardRequests).toHaveLength(0);
    expect(managementRequests).toHaveLength(0);

    await page.getByRole("button", { name: "Chỉ số nâng cao" }).click();
    await expect.poll(() => managementRequests.length).toBeGreaterThan(0);
    expect(dashboardRequests).toHaveLength(0);

    await page.getByRole("button", { name: "Biểu đồ và mặt hàng nổi bật" }).click();
    await expect.poll(() => dashboardRequests.length).toBeGreaterThan(0);
  });
});
