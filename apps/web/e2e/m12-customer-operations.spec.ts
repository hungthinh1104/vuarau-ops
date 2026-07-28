import { expect, signIn, test } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

test.describe("TC-E2E-025 — M12 customer operations", () => {
  test("creates despite a surfaced duplicate, edits, archives and restores without moving debt", async ({
    page,
  }) => {
    const phone = `090${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const originalName = uniqueCustomerName("M12 nguồn");
    await api.createCustomer(originalName, "owner", { phone });
    const newName = uniqueCustomerName("M12 mới");

    await signIn(page, "owner");
    await page.goto("/customers/new");
    await page.getByLabel("Tên khách hàng").fill(newName);
    await page.getByLabel("Số điện thoại").fill(phone);
    await page.getByLabel("Ghi chú").fill("Khách mới từ màn hình quản lý");
    await expect(page.getByRole("heading", { name: "Có thể đã có khách này" })).toBeVisible();
    await page.getByRole("button", { name: "Tạo khách hàng" }).click();
    await page.waitForURL(/\/customers\/[0-9a-f-]+$/);
    const customerId = new URL(page.url()).pathname.split("/").at(-1);
    expect(customerId).toBeTruthy();
    if (customerId === undefined) return;

    await api.openingBalance(customerId, 125_000);
    await page.reload();
    await expect(page.getByText("125.000 ₫", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Sửa hồ sơ" }).click();
    await page.getByLabel("Tên khách hàng").fill(`${newName} đã sửa`);
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByRole("heading", { name: `${newName} đã sửa` })).toBeVisible();

    await page.getByRole("button", { name: "Ngưng khách hàng" }).click();
    await expect(page.getByText("Đã ngưng", { exact: true })).toBeVisible();
    expect((await api.balance(customerId)).balance.amountMinor).toBe(125_000);

    await page.getByRole("button", { name: "Kích hoạt lại" }).click();
    await expect(page.getByRole("button", { name: "Ngưng khách hàng" })).toBeVisible();
    expect((await api.balance(customerId)).balance.amountMinor).toBe(125_000);
    expect((await api.timeline(customerId)).items).toHaveLength(1);
  });
});
