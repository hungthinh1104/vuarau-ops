import { api } from "./harness/api.ts";
import { E2E_QUALITY_GRADE_ID } from "./harness/environment.ts";
import { expect, signIn, test } from "./harness/signed-in.ts";

test.describe("M23.7-M23.9 — operational correctness (TC-E2E-032)", () => {
  test("preserves Product, grade, fulfilment, inventory and money truth end to end", async ({
    page,
  }) => {
    await signIn(page, "owner");

    const suffix = Date.now();
    const secondGrade = `Hạng B ${suffix}`;
    await page.goto("/quality-grades");
    await page.getByLabel("Tên phân hạng").fill(secondGrade);
    await page.getByLabel("Thứ tự").fill("20");
    await page.getByRole("button", { name: "Thêm phân hạng" }).click();
    await expect(page.getByText(secondGrade, { exact: true })).toBeVisible();
    const secondGradeId = await api.qualityGradeIdByName(secondGrade);

    const productName = `Cà M23 ${suffix}`;
    await page.goto("/products/new");
    await page.getByLabel("Tên mặt hàng").fill(productName);
    await page.getByLabel("Đơn vị gợi ý").selectOption("kg");
    await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    const productId = new URL(page.url()).pathname.split("/").at(-1)!;

    const supplierName = `Nhà vườn M23 ${suffix}`;
    await page.goto("/suppliers/new");
    await page.getByLabel("Tên nhà cung cấp").fill(supplierName);
    await page.getByRole("button", { name: "Tạo nhà cung cấp" }).click();
    await page.waitForURL(/\/suppliers\/[0-9a-f-]+$/);
    const supplierId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.goto("/purchases/new");
    await page.getByLabel("Nhà cung cấp").selectOption(supplierId);
    await page.getByLabel("Mặt hàng").selectOption(productId);
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
    await saleLine.getByLabel("Mặt hàng").fill(productName);
    await page.getByRole("button", { name: `${productName} · kg`, exact: true }).click();
    await saleLine.getByLabel("Phân hạng chất lượng").selectOption({ label: "Loại 1" });
    await saleLine.getByLabel("Số lượng").fill("80");
    await saleLine.getByLabel("Đơn giá").fill("10.000");
    await page.getByRole("button", { name: "Chốt đơn" }).click();
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
    const reclass = page.getByRole("heading", { name: "Chuyển phẩm cấp" }).locator("..");
    await reclass.getByLabel("Từ phẩm cấp").selectOption({ label: secondGrade });
    await reclass.getByLabel("Sang phẩm cấp").selectOption({ label: "Loại 1" });
    await reclass.getByLabel("Số lượng").fill("10");
    await reclass.getByLabel("Lý do").fill("Phân loại lại cuối ngày");
    await reclass.getByRole("button", { name: "Ghi chuyển phẩm cấp" }).click();
    await expect(page.getByRole("paragraph").filter({ hasText: /^10 kg$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^20 kg$/ })).toBeVisible();

    const adjustment = page.getByRole("heading", { name: "Điều chỉnh tồn kho" }).locator("..");
    await adjustment.getByLabel("Hướng").selectOption("decrease");
    await adjustment.getByLabel("Số lượng").fill("4");
    await adjustment.getByLabel("Phẩm cấp").selectOption({ label: "Loại 1" });
    await adjustment.getByLabel("Mã lý do").selectOption("spoilage");
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
