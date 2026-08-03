import { expect, signIn, test } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";

async function chooseOption(page: Parameters<typeof signIn>[0], label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("TC-E2E-CUSTOMER-ORDER-001 creates and cancels a commercial-only draft", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/customer-orders/new");

  await chooseOption(page, "Kênh đơn", "Khách lẻ");
  await page.getByLabel("Tên mặt hàng ghi nhận").fill(`Cải đặt trước ${Date.now()}`);
  await page.getByLabel("Số lượng").fill("12");
  await page.getByRole("button", { name: "Lưu đơn đặt hàng" }).click();
  await page.waitForURL(/\/customer-orders\/[0-9a-f-]+$/);

  const orderId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: "Chi tiết đơn đặt hàng" })).toBeVisible();
  await expect(page.getByText("Tổng: Chưa chốt giá", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Đơn đặt hàng là sự thật thương mại; chưa ghi công nợ, tiền mặt hay tồn kho."),
  ).toBeVisible();
  expect(await api.customerOrder(orderId)).toMatchObject({
    id: orderId,
    status: "draft",
    totalAmount: null,
  });

  await page.getByLabel("Lý do huỷ").fill("Khách đổi nhu cầu");
  await page.getByRole("button", { name: "Huỷ đơn đặt hàng" }).click();
  await expect(page.getByText("Đã huỷ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Huỷ đơn đặt hàng" })).toHaveCount(0);
  expect(await api.customerOrder(orderId)).toMatchObject({ id: orderId, status: "cancelled" });
});
