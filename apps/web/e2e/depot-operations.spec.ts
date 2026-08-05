import { api } from "./harness/api.ts";
import { expect, signIn, test } from "./harness/signed-in.ts";

async function chooseOption(page: Parameters<typeof signIn>[0], label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("Depot operations (TC-E2E-030)", () => {
  test("dispatches two partial deliveries, completes them, and records an explicit return", async ({
    page,
  }) => {
    await signIn(page, "owner");

    const productName = `Bí depot ${Date.now()}`;
    await page.goto("/products/new");
    await page.getByLabel("Tên mặt hàng").fill(productName);
    await chooseOption(page, "Đơn vị gợi ý", "kg");
    await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    const productId = new URL(page.url()).pathname.split("/").at(-1)!;

    const customerId = await api.createCustomer(`Khách depot ${Date.now()}`);
    const { saleId } = await api.createPostedSale({
      customerId,
      productId,
      productName,
      quantityScaled: 100_000,
    });
    const debtBefore = await api.balance(customerId);
    const deliveryIds: string[] = [];

    for (const quantity of ["60", "40"]) {
      await page.goto(`/sales/${saleId}`);
      await page.getByRole("link", { name: "Giao đơn" }).click();
      await page.getByLabel(`Số lượng giao ${productName}`).fill(quantity);
      await page.getByRole("button", { name: "Lưu để giao sau" }).click();
      await page.waitForURL(/\/deliveries\/[0-9a-f-]+$/);
      deliveryIds.push(new URL(page.url()).pathname.split("/").at(-1)!);
      await page.getByRole("button", { name: "Xuất kho & bắt đầu giao" }).click();
      await expect(
        page.getByRole("region", { name: "Tóm tắt giao hàng" }).getByText("Đang giao", {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Xác nhận giao xong" }).click();
      await expect(
        page.getByRole("region", { name: "Tóm tắt giao hàng" }).getByText("Đã giao", {
          exact: true,
        }),
      ).toBeVisible();
    }

    await page.goto(`/deliveries/${deliveryIds[0]}`);
    await page.getByLabel(`Số lượng trả ${productName}`).fill("10");
    await page.getByLabel("Lý do").fill("Khách trả lại 10 kg");
    await page.getByRole("button", { name: "Ghi hàng trả" }).click();
    await expect(page.getByText("Trả 10 kg")).toBeVisible();

    await page.goto(`/sales/${saleId}`);
    await expect(page.getByText("Đã xuất 100 kg")).toBeVisible();
    await expect(page.getByText("Đã trả 10 kg")).toBeVisible();
    await expect(page.getByText("Còn 10 kg")).toBeVisible();
    expect(await api.balance(customerId)).toEqual(debtBefore);
    expect(await api.deliveryTruth({ saleId, productId })).toEqual({
      outboundSources: 2,
      returnSources: 1,
      inventoryQuantityScaled: -90_000,
      netFulfilledScaled: 90_000,
    });
  });
});
