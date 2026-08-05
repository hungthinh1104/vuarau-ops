import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";

async function chooseOption(page: Parameters<typeof signIn>[0], label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function chooseSupplier(page: Parameters<typeof signIn>[0], supplierName: string) {
  await page.getByRole("combobox", { name: "Nhà cung cấp" }).click();
  await page.getByRole("searchbox", { name: "Tìm nhà cung cấp" }).fill(supplierName);
  await page.getByRole("option", { name: supplierName, exact: true }).click();
}

async function chooseProduct(page: Parameters<typeof signIn>[0], productName: string) {
  await page.getByRole("combobox", { name: "Mặt hàng" }).click();
  await page.getByRole("searchbox", { name: "Tìm mặt hàng" }).fill(productName);
  await page.getByRole("option", { name: productName, exact: true }).click();
}

async function createQualityGrade(page: Parameters<typeof signIn>[0], name: string) {
  await page.goto("/quality-grades");
  await page.getByLabel("Tên hạng hàng").fill(name);
  await page.getByLabel("Thứ tự").fill("-10000");
  const addGrade = page.getByRole("button", { name: "Thêm hạng hàng" });
  await addGrade.focus();
  await addGrade.press("Enter");
  await page.getByLabel("Tìm hạng hàng").fill(name);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test.describe("Goods Truth", () => {
  test("keeps Purchase payable and physical receipts separate and attributable", async ({
    page,
  }) => {
    await signIn(page, "owner");
    await api.resetQualityGradeFixture();
    await api.retirePurchaseCorrectionPolicies();

    const suffix = Date.now();
    const primaryQualityGradeName = `Loại 1 Goods ${suffix}`;
    const qualityGradeName = `Loại 2 Goods ${suffix}`;
    await createQualityGrade(page, primaryQualityGradeName);
    await createQualityGrade(page, qualityGradeName);

    const productName = `${String(Number.MAX_SAFE_INTEGER - suffix).padStart(16, "0")} Cải Goods`;
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
    await chooseSupplier(page, supplierName);
    await chooseProduct(page, productName);
    await page.getByLabel("Số lượng").fill("100");
    await page.getByLabel("Đơn giá (kđ)").fill("10");
    await page.getByRole("button", { name: /^Lưu và (mở )?nhận hàng$/ }).click();
    await page.waitForURL(/\/purchases\/[0-9a-f-]+$/);
    const purchaseId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(
      page
        .getByRole("region", { name: "Tóm tắt hàng mua" })
        .getByRole("group", { name: "Tổng mua" })
        .getByText("1.000.000 ₫", { exact: true }),
    ).toBeVisible();

    await page.goto(`/suppliers/${supplierId}`);
    const paymentPanel = page.getByRole("region", { name: "Ghi tiền trả nhà cung cấp" });
    await paymentPanel.getByLabel("Số tiền (nghìn đồng)").fill("400");
    await paymentPanel.getByRole("button", { name: "Ghi thanh toán" }).click();
    await expect(page.getByText("600.000 ₫")).toBeVisible();

    await page.goto(`/purchases/${purchaseId}`);
    await page.getByRole("button", { name: "Chia theo hạng" }).click();
    await page.getByLabel(`${productName} · ${primaryQualityGradeName}`).fill("60");
    await page.getByRole("button", { name: "Ghi phiếu nhập kho" }).click();
    await expect(page.getByRole("link", { name: /^Phiếu nhập kho / })).toHaveCount(1);

    await page.getByLabel(qualityGradeName).fill("40");
    await page.getByRole("button", { name: "Ghi phiếu nhập kho" }).click();
    await expect(page.getByRole("link", { name: /^Phiếu nhập kho / })).toHaveCount(2);
    await expect(page.getByText(/đã nhận 100 kg · còn lại 0 kg/)).toBeVisible();

    await page.getByLabel(`${productName} · ${primaryQualityGradeName}`).fill("1");
    await page.getByRole("button", { name: "Ghi phiếu nhập kho" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Số lượng nhận vượt số lượng đã mua" }),
    ).toBeVisible();

    await expect(page.getByRole("status")).toContainText("Hãy tạo và phê duyệt quy định");

    for (let index = 0; index < 2; index += 1) {
      await page.getByRole("button", { name: "Hoàn tác phiếu nhận" }).first().click();
      const reversePanel = page.getByRole("region", { name: "Hoàn tác phiếu nhận" });
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
          qualityGradeName: primaryQualityGradeName,
          unit: "kg",
          quantityScaled: 0,
          movementCount: 2,
        }),
        expect.objectContaining({
          qualityGradeName,
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
    const timeline = page.getByRole("region", { name: "Dòng thời gian công nợ" });
    await expect(timeline.getByRole("link", { name: "Mở chứng từ" })).toHaveCount(3);

    await signIn(page, "warehouse");
    await page.goto(`/purchases/${purchaseId}`);
    await expect(page.getByRole("link", { name: productName })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hoàn tác đơn mua" })).toHaveCount(0);
    await page.goto(`/suppliers/${supplierId}`);
    await expect(page.getByRole("heading", { name: supplierName })).toBeVisible();
    await expect(page.getByText("Ghi tiền trả nhà cung cấp")).toHaveCount(0);
  });

  test("TC-E2E-PURCHASE-CORRECTION-001 uses the approved policy without changing original receiving", async ({
    page,
  }) => {
    await signIn(page, "owner");
    await api.resetQualityGradeFixture();
    await api.approvePurchaseCorrectionPolicy();

    const primaryQualityGradeName = `Loại 1 correction ${Date.now()}`;
    await createQualityGrade(page, primaryQualityGradeName);

    const productName = `${String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(16, "0")} Cải correction`;
    await page.goto("/products/new");
    await page.getByLabel("Tên mặt hàng").fill(productName);
    await chooseOption(page, "Đơn vị gợi ý", "kg");
    await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    const productId = new URL(page.url()).pathname.split("/").at(-1)!;

    const supplierName = `Nhà vườn correction ${Date.now()}`;
    await page.goto("/suppliers/new");
    await page.getByLabel("Tên nhà cung cấp").fill(supplierName);
    await page.getByRole("button", { name: "Tạo nhà cung cấp" }).click();
    await page.waitForURL(/\/suppliers\/[0-9a-f-]+$/);
    const supplierId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.goto("/purchases/new");
    await chooseSupplier(page, supplierName);
    await chooseProduct(page, productName);
    await page.getByLabel("Số lượng").fill("100");
    await page.getByLabel("Đơn giá (kđ)").fill("10");
    await page.getByRole("button", { name: /^Lưu và (mở )?nhận hàng$/ }).click();
    await page.waitForURL(/\/purchases\/[0-9a-f-]+$/);
    const purchaseId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.getByRole("button", { name: "Chia theo hạng" }).click();
    await page.getByLabel(`${productName} · ${primaryQualityGradeName}`).fill("30");
    await page.getByRole("button", { name: "Ghi phiếu nhập kho" }).click();
    await expect(page.getByText(/đã nhận 30 kg · còn lại 70 kg/)).toBeVisible();
    await chooseOption(page, "Lý do", "Sửa phần tiền sau khi nhập hàng");
    await page
      .getByLabel("Giải thích")
      .last()
      .fill("Sai giá chứng từ, hàng vẫn giữ nguyên trong kho.");
    await page.getByRole("button", { name: "Hoàn tác đơn mua" }).click();
    await expect(page.getByText("Đơn mua đã được hoàn tác")).toBeVisible();
    await expect(page.getByText(/đã nhận 30 kg · còn lại 70 kg/)).toBeVisible();

    await page.getByRole("link", { name: "Tạo đơn mua thay thế" }).click();
    await chooseSupplier(page, supplierName);
    await chooseProduct(page, productName);
    await page.getByLabel("Số lượng").fill("20");
    await page.getByLabel("Đơn giá (kđ)").fill("11");
    await page.getByRole("button", { name: /^Lưu và (mở )?nhận hàng$/ }).click();
    await page.waitForURL(/\/purchases\/[0-9a-f-]+$/);
    await expect(page.getByText(/đã nhận 0 kg · còn lại 20 kg/)).toBeVisible();

    expect((await api.supplierBalance(supplierId)).balance.amountMinor).toBe(220_000);
    expect(await api.inventoryBalances(productId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ quantityScaled: 30_000 })]),
    );
    expect(await api.goodsCounts({ supplierId, purchaseId, productId })).toMatchObject({
      purchases: 1,
      receipts: 1,
    });
  });
});
