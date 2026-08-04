import { api } from "./harness/api.ts";
import { expect, signIn, test } from "./harness/signed-in.ts";

async function chooseOption(
  page: Parameters<typeof signIn>[0],
  label: string,
  option: string,
): Promise<void> {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function chooseSupplier(page: Parameters<typeof signIn>[0], name: string): Promise<void> {
  await page.getByRole("combobox", { name: "Nhà cung cấp", exact: true }).click();
  await page.getByRole("searchbox", { name: "Tìm nhà cung cấp" }).fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}

async function choosePurchaseProduct(
  page: Parameters<typeof signIn>[0],
  name: string,
): Promise<void> {
  await page.getByRole("combobox", { name: "Mặt hàng", exact: true }).click();
  await page.getByRole("searchbox", { name: "Tìm mặt hàng" }).fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}

async function chooseProduct(page: Parameters<typeof signIn>[0], name: string): Promise<void> {
  await page.getByRole("button", { name: "Mở bảng chọn mặt hàng và giá gần đây" }).click();
  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await picker.getByLabel("Tìm mặt hàng").fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}( ·|$)`) }).press("Enter");
}

test.describe("Workflow hardening (TC-E2E-WORKFLOW-HARDENING)", () => {
  test("purchase to receipt to stock, then ungraded sale to delivered dashboard", async ({
    page,
  }) => {
    await signIn(page, "owner");
    const previousQualityGradeMode = await api.setQualityGradeMode("disabled");
    const suffix = Date.now();
    const productName = `Cải workflow ${suffix}`;
    const supplierName = `Nhà vườn workflow ${suffix}`;

    try {
      await page.goto("/products/new");
      await page.getByLabel("Tên mặt hàng").fill(productName);
      await chooseOption(page, "Đơn vị gợi ý", "kg");
      await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
      await page.waitForURL(/\/products\/[0-9a-f-]+$/);
      const productId = new URL(page.url()).pathname.split("/").at(-1)!;

      await page.goto("/suppliers/new");
      await page.getByLabel("Tên nhà cung cấp").fill(supplierName);
      await page.getByRole("button", { name: "Tạo nhà cung cấp" }).click();
      await page.waitForURL(/\/suppliers\/[0-9a-f-]+$/);

      await page.goto("/purchases/new");
      await chooseSupplier(page, supplierName);
      await choosePurchaseProduct(page, productName);
      await page.getByLabel("Số lượng").fill("10");
      await page.getByLabel("Đơn giá (nghìn đồng)").fill("10");
      await page.getByRole("button", { name: "Lưu và nhận hàng" }).click();
      await page.waitForURL(/\/purchases\/[0-9a-f-]+$/);
      await expect(page.getByText(/đã nhận 10 kg · còn lại 0 kg/)).toBeVisible();
      await expect(page.getByText(/Không phân loại/)).toBeVisible();

      expect(await api.inventoryBalances(productId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ qualityGradeName: null, unit: "kg", quantityScaled: 10_000 }),
        ]),
      );

      await page.goto("/reports");
      await expect(page.getByRole("heading", { name: "Tổng quan vận hành" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Đã nhập hàng" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Tồn kho" })).toBeVisible();

      const customerId = await api.createCustomer(`Khách workflow ${suffix}`);
      await page.goto(`/customers/${customerId}/sales/new`);
      await chooseProduct(page, productName);
      await chooseOption(page, "Đơn vị", "kg");
      const saleLine = page.getByTestId("sale-line-0");
      await saleLine.getByLabel("Số lượng").fill("10");
      await saleLine.getByLabel("Đơn giá").fill("10.000");
      await expect(page.getByLabel(/Phân hạng chất lượng/)).toHaveCount(0);
      await page.getByRole("button", { name: "Chốt đơn" }).click();
      const confirmation = page.getByRole("dialog").getByRole("button", { name: "Chốt đơn" });
      await confirmation.press("Enter");
      await page.waitForURL(/\/sales\/[0-9a-f-]+$/);
      const saleId = new URL(page.url()).pathname.split("/").at(-1)!;
      await expect(page.getByText("Còn 10 kg")).toBeVisible();

      await page.getByRole("link", { name: "Tạo phiếu giao" }).click();
      await expect(page.getByText(/Không phân loại/)).toBeVisible();
      await page.getByRole("button", { name: "Giao tất cả" }).click();
      await page.waitForURL(/\/deliveries\/[0-9a-f-]+$/);
      await expect(page.getByText("Đã giao", { exact: true })).toBeVisible();
      await expect(page.getByText("Đã ghi nhận", { exact: true })).toHaveCount(0);

      expect(await api.inventoryBalances(productId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ qualityGradeName: null, unit: "kg", quantityScaled: 0 }),
        ]),
      );
      expect(await api.deliveryTruth({ saleId, productId })).toMatchObject({
        outboundSources: 1,
        netFulfilledScaled: 10_000,
      });

      await page.goto("/reports");
      await expect(page.getByRole("heading", { name: "Tổng quan vận hành" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Còn phải giao" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Phải thu" })).toBeVisible();
    } finally {
      await api.setQualityGradeMode(previousQualityGradeMode);
    }
  });
});
