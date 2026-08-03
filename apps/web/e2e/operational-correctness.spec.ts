import { api } from "./harness/api.ts";
import { E2E_QUALITY_GRADE_ID } from "./harness/environment.ts";
import { expect, signIn, test } from "./harness/signed-in.ts";
import type { Locator, Page } from "@playwright/test";

async function chooseOption(scope: Page | Locator, label: string, option: string): Promise<void> {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await scope.getByRole("option", { name: option, exact: true }).click();
}

async function chooseSupplierOption(page: Page, supplierName: string): Promise<void> {
  await page.getByRole("combobox", { name: "Nhà cung cấp", exact: true }).click();
  await page.getByRole("searchbox", { name: "Tìm nhà cung cấp" }).fill(supplierName);
  await page.getByRole("option", { name: supplierName, exact: true }).click();
}

async function chooseProductOption(page: Page, productName: string): Promise<void> {
  await page.getByRole("combobox", { name: "Mặt hàng", exact: true }).click();
  await page.getByRole("searchbox", { name: "Tìm mặt hàng" }).fill(productName);
  await page.getByRole("option", { name: productName, exact: true }).click();
}

async function chooseProduct(page: Page, productName: string): Promise<void> {
  await page.getByRole("button", { name: "Mở bảng chọn mặt hàng và giá gần đây" }).click();
  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await picker.getByLabel("Tìm mặt hàng").fill(productName);
  const product = picker.getByRole("button", {
    name: new RegExp(`^${productName}( ·|$)`),
  });
  await product.focus();
  await product.press("Enter");
}

test.describe("Operational correctness (TC-E2E-032)", () => {
  test("preserves Product, grade, fulfilment, inventory and money truth end to end", async ({
    page,
  }) => {
    await signIn(page, "owner");

    const suffix = Date.now();
    const secondGrade = `Hạng B ${suffix}`;
    await page.goto("/quality-grades");
    await page.getByLabel("Tên phẩm cấp").fill(secondGrade);
    await page.getByLabel("Thứ tự").fill("-10000");
    const addGrade = page.getByRole("button", { name: "Thêm phẩm cấp" });
    await addGrade.focus();
    await addGrade.press("Enter");
    await page.getByLabel("Tìm phẩm cấp").fill(secondGrade);
    await expect(page.getByText(secondGrade, { exact: true })).toBeVisible();
    const secondGradeId = await api.qualityGradeIdByName(secondGrade);

    const productName = `Cà M23 ${suffix}`;
    await page.goto("/products/new");
    await page.getByLabel("Tên mặt hàng").fill(productName);
    await chooseOption(page, "Đơn vị gợi ý", "kg");
    await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    const productId = new URL(page.url()).pathname.split("/").at(-1)!;

    const supplierName = `Nhà vườn M23 ${suffix}`;
    await page.goto("/suppliers/new");
    await page.getByLabel("Tên nhà cung cấp").fill(supplierName);
    await page.getByRole("button", { name: "Tạo nhà cung cấp" }).click();
    await page.waitForURL(/\/suppliers\/[0-9a-f-]+$/);

    await page.goto("/purchases/new");
    await chooseSupplierOption(page, supplierName);
    await chooseProductOption(page, productName);
    await page.getByLabel("Số lượng").fill("100");
    await page.getByLabel("Đơn giá (nghìn đồng)").fill("10");
    await page.getByRole("button", { name: "Xác nhận đơn mua" }).click();
    await page.waitForURL(/\/purchases\/[0-9a-f-]+$/);
    await page.getByLabel("Loại 1").fill("70");
    await page.getByLabel(secondGrade).fill("30");
    await page.getByRole("button", { name: "Ghi phiếu nhận hàng" }).click();
    await expect(page.getByText(/đã nhận 100 kg · còn lại 0 kg/)).toBeVisible();

    await page.goto(`/products/${productId}/inventory`);
    await expect(page.getByRole("paragraph").filter({ hasText: /^70 kg$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^30 kg$/ })).toBeVisible();

    const customerId = await api.createCustomer(`Khách M23 ${suffix}`);
    await page.goto(`/customers/${customerId}/sales/new`);
    const saleLine = page.getByTestId("sale-line-0");
    await chooseProduct(page, productName);
    await chooseOption(page, "Phân hạng chất lượng", "Loại 1");
    await chooseOption(page, "Đơn vị", "kg");
    await saleLine.getByLabel("Số lượng").fill("80");
    await saleLine.getByLabel("Đơn giá").fill("10.000");
    await page.getByRole("button", { name: "Chốt đơn" }).click();
    const confirmation = page.getByRole("dialog").getByRole("button", { name: "Chốt đơn" });
    await confirmation.focus();
    await confirmation.press("Enter");
    await page.waitForURL(/\/sales\/[0-9a-f-]+$/);
    const saleId = new URL(page.url()).pathname.split("/").at(-1)!;
    const debtAfterPost = await api.balance(customerId);
    expect(debtAfterPost.balance.amountMinor).toBe(800_000);
    await expect(page.getByText("Còn 80 kg")).toBeVisible();

    const deliveryIds: string[] = [];
    for (const quantity of ["50", "30"]) {
      await page.goto(`/sales/${saleId}`);
      await page.getByRole("link", { name: "Tạo phiếu giao" }).click();
      await page.getByLabel(`Số lượng giao ${productName}`).fill(quantity);
      await page.getByRole("button", { name: "Soạn phiếu giao" }).click();
      await page.waitForURL(/\/deliveries\/[0-9a-f-]+$/);
      deliveryIds.push(new URL(page.url()).pathname.split("/").at(-1)!);
      await page.getByRole("button", { name: "Xuất hàng / Bắt đầu giao" }).click();
      await page.getByRole("button", { name: "Đã giao khách" }).click();
    }

    await page.goto(`/deliveries/${deliveryIds[0]}`);
    await page.getByLabel(`Số lượng trả ${productName}`).fill("10");
    await page.getByLabel("Lý do").fill("Khách trả lại một phần");
    await page.getByRole("button", { name: "Ghi hàng trả" }).click();
    await page.goto(`/sales/${saleId}`);
    await expect(page.getByText("Đã xuất 80 kg")).toBeVisible();
    await expect(page.getByText("Đã trả 10 kg")).toBeVisible();
    await expect(page.getByText("Còn 10 kg")).toBeVisible();

    await page.goto(`/products/${productId}/inventory`);
    const reclass = page.getByRole("region", { name: "Chuyển phẩm cấp" });
    await chooseOption(page, "Từ phẩm cấp", secondGrade);
    await chooseOption(page, "Sang phẩm cấp", "Loại 1");
    await reclass.getByLabel("Số lượng").fill("10");
    await reclass.getByLabel("Lý do").fill("Phân loại lại cuối ngày");
    await reclass.getByRole("button", { name: "Ghi chuyển phẩm cấp" }).click();
    await expect(page.getByRole("paragraph").filter({ hasText: /^10 kg$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^20 kg$/ })).toBeVisible();

    const adjustment = page.getByRole("region", { name: "Điều chỉnh tồn kho" });
    await chooseOption(page, "Hướng", "Giảm");
    await adjustment.getByLabel("Số lượng").fill("4");
    await chooseOption(page, "Phẩm cấp", "Loại 1");
    await chooseOption(page, "Lý do", "Hư hỏng");
    await adjustment.getByLabel("Giải thích").fill("Dập sau một ngày");
    await adjustment.getByRole("button", { name: "Ghi điều chỉnh" }).click();

    await expect(page.getByRole("paragraph").filter({ hasText: /^6 kg$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^20 kg$/ })).toBeVisible();
    expect(await api.balance(customerId)).toEqual(debtAfterPost);
    expect(await api.inventoryReconciliation(productId, E2E_QUALITY_GRADE_ID, "kg")).toMatchObject({
      status: "consistent",
      diagnostics: [],
    });
    expect(await api.inventoryReconciliation(productId, secondGradeId, "kg")).toMatchObject({
      status: "consistent",
      diagnostics: [],
    });
  });
});
