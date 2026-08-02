import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";

async function chooseOption(page: Parameters<typeof signIn>[0], label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("M16-M18 — Goods Truth", () => {
  test("keeps Purchase payable and physical receipts separate and attributable", async ({
    page,
  }) => {
    await signIn(page, "owner");

    await page.goto("/quality-grades");
    await page.getByLabel("Tên phẩm cấp").fill("Loại 2");
    await page.getByLabel("Thứ tự").fill("20");
    const addGrade = page.getByRole("button", { name: "Thêm phẩm cấp" });
    await addGrade.focus();
    await addGrade.press("Enter");
    await expect(page.getByText("Loại 2", { exact: true })).toBeVisible();

    const productName = `${String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(16, "0")} Cải Goods`;
    await page.goto("/products/new");
    await page.getByLabel("Tên mặt hàng").fill(productName);
    await chooseOption(page, "Đơn vị gợi ý", "kg");
    await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    const productId = new URL(page.url()).pathname.split("/").at(-1)!;

    const supplierName = `Nhà vườn Goods ${Date.now()}`;
    await page.goto("/suppliers/new");
    await page.getByLabel("Tên nhà cung cấp").fill(supplierName);
    await page.getByRole("button", { name: "Tạo nhà cung cấp" }).click();
    await page.waitForURL(/\/suppliers\/[0-9a-f-]+$/);
    const supplierId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.goto("/purchases/new");
    await chooseOption(page, "Nhà cung cấp", supplierName);
    await chooseOption(page, "Mặt hàng", productName);
    await page.getByLabel("Số lượng").fill("100");
    await page.getByLabel("Đơn giá (nghìn đồng)").fill("10");
    await page.getByRole("button", { name: "Xác nhận đơn mua" }).click();
    await page.waitForURL(/\/purchases\/[0-9a-f-]+$/);
    const purchaseId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(page.getByText("Tổng mua").locator("..").getByText("1.000.000 ₫")).toBeVisible();

    await page.goto(`/suppliers/${supplierId}`);
    const paymentPanel = page
      .getByRole("heading", {
        name: "Ghi tiền trả nhà cung cấp",
      })
      .locator("..");
    await paymentPanel.getByLabel("Số tiền (nghìn đồng)").fill("400");
    await paymentPanel.getByRole("button", { name: "Ghi thanh toán" }).click();
    await expect(page.getByText("600.000 ₫")).toBeVisible();

    await page.goto(`/purchases/${purchaseId}`);
    await page.getByLabel("Loại 1").fill("60");
    await page.getByRole("button", { name: "Ghi phiếu nhận hàng" }).click();
    await expect(page.locator('a[href^="/receipts/"]')).toHaveCount(1);

    await page.getByLabel("Loại 2").fill("40");
    await page
      .getByRole("button", { name: "Ghi phiếu nhận hàng" })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    await expect(page.locator('a[href^="/receipts/"]')).toHaveCount(2);
    await expect(page.getByText(/đã nhận 100 kg · còn lại 0 kg/)).toBeVisible();

    await page.getByLabel("Loại 1").fill("1");
    await page.getByRole("button", { name: "Ghi phiếu nhận hàng" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Số lượng nhận vượt số lượng đã mua" }),
    ).toBeVisible();

    await expect(
      page.getByRole("status").filter({ hasText: "Đơn mua đã có hàng thực nhận" }),
    ).toBeVisible();

    for (let index = 0; index < 2; index += 1) {
      await page.getByRole("button", { name: "Hoàn tác phiếu nhận" }).first().click();
      const reversePanel = page
        .getByRole("heading", {
          name: "Hoàn tác phiếu nhận",
        })
        .locator("..");
      await reversePanel.getByLabel("Giải thích").fill(`Hoàn tác phiếu ${index + 1}`);
      await reversePanel.getByRole("button", { name: "Xác nhận hoàn tác" }).click();
      await expect(page.getByText("Đã hoàn tác")).toHaveCount(index + 1);
    }

    await page.getByLabel("Giải thích").last().fill("Hoàn tác sau khi trả hàng");
    await page.getByRole("button", { name: "Hoàn tác đơn mua" }).click();
    await expect(page.getByText("Đơn mua đã được hoàn tác")).toBeVisible();

    const supplier = await api.supplierBalance(supplierId);
    expect(supplier.balance.amountMinor).toBe(-400_000);
    expect(supplier.entryCount).toBe(3);
    const inventory = await api.inventoryBalances(productId);
    expect(inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          qualityGradeName: "Loại 1",
          unit: "kg",
          quantityScaled: 0,
          movementCount: 2,
        }),
        expect.objectContaining({
          qualityGradeName: "Loại 2",
          unit: "kg",
          quantityScaled: 0,
          movementCount: 2,
        }),
      ]),
    );
    expect(await api.goodsCounts({ supplierId, purchaseId, productId })).toEqual({
      purchases: 1,
      supplierEntries: 3,
      movements: 4,
      receipts: 2,
    });

    await page.goto(`/suppliers/${supplierId}`);
    const timeline = page.getByText("Dòng thời gian công nợ").locator("..");
    await expect(timeline.locator(`a[href="/purchases/${purchaseId}"]`)).toHaveCount(2);
    await expect(timeline.locator('a[href^="/supplier-payments/"]')).toHaveCount(1);

    await signIn(page, "warehouse");
    await page.goto(`/purchases/${purchaseId}`);
    await expect(page.getByRole("link", { name: productName })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hoàn tác đơn mua" })).toHaveCount(0);
    await page.goto(`/suppliers/${supplierId}`);
    await expect(page.getByRole("heading", { name: supplierName })).toBeVisible();
    await expect(page.getByText("Ghi tiền trả nhà cung cấp")).toHaveCount(0);
  });
});
