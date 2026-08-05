import { expect, test, signIn } from "./harness/signed-in.ts";
import type { Page } from "@playwright/test";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

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

async function chooseOption(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("Durable offline Quick Sale", () => {
  test("survives offline reload and synchronizes exactly one posting", async ({
    page,
    context,
  }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("offline"));
    await signIn(page);
    await page.goto(`/customers/${customerId}/sales/new`);
    await expect(page.getByRole("textbox", { name: "Mặt hàng" })).toBeVisible();
    await page.waitForURL(/localSaleId=/);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The first visit installs the shell worker. One controlled online reload
    // lets it cache this route and its hashed Next assets before connectivity
    // disappears.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Mặt hàng" })).toBeVisible();

    await chooseProduct(page, "Rau muống");
    await chooseOption(page, "Hạng hàng", "Loại 1");
    await chooseOption(page, "Đơn vị", "bó");
    await page.getByLabel("Số lượng").fill("10");
    await page.getByLabel("Đơn giá").fill("12.000");
    await page.getByLabel("Ghi chú").fill("Ảnh chụp bất biến trên thiết bị");
    await page.waitForTimeout(250);

    // A local draft has no frozen command yet, so reload must preserve it
    // without taking away the worker's ability to continue editing.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Mặt hàng" })).toHaveValue("Rau muống");
    await expect(page.getByRole("textbox", { name: "Mặt hàng" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "+ Thêm dòng" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeEnabled();

    await context.setOffline(true);
    await page.getByRole("button", { name: "Chốt đơn", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Chốt đơn", exact: true }).click();
    await expect(page.getByText(/Đã lưu trên thiết bị/)).toBeVisible();

    await page.reload();
    await expect(
      page.getByTestId("sale-line-0").getByRole("textbox", { name: "Mặt hàng" }),
    ).toHaveValue("Rau muống");
    await expect(
      page.getByText("Đã lưu trên thiết bị · chờ máy chủ", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Đơn đã được lưu an toàn trên thiết bị.")).toBeVisible();
    await expect(
      page.getByTestId("sale-line-0").getByRole("textbox", { name: "Mặt hàng" }),
    ).toBeDisabled();
    await expect(page.getByTestId("sale-line-0").getByLabel("Số lượng")).toBeDisabled();
    await expect(page.getByTestId("sale-line-0").getByLabel("Đơn vị")).toBeDisabled();
    await expect(page.getByTestId("sale-line-0").getByLabel("Đơn giá")).toBeDisabled();
    await expect(page.getByRole("button", { name: "+ Thêm dòng" })).toBeDisabled();
    await expect(page.getByLabel("Ghi chú")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Chốt đơn" })).toBeDisabled();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(async () => (await api.sales(customerId)).items.length, { timeout: 20_000 })
      .toBe(1);
    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    const posted = await api.sale(sales.items[0]!.id);
    expect(posted.note).toBe("Ảnh chụp bất biến trên thiết bị");
    expect(posted.lines).toMatchObject([
      {
        productName: "Rau muống",
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 10_000, unit: "bo" },
        unitPrice: { amountMinor: 12_000, currency: "VND" },
      },
    ]);
    const timeline = await api.timeline(customerId);
    expect(timeline.items.filter((entry) => entry.source.type === "sale_posting")).toHaveLength(1);
  });

  test("queues an inline customer before its Sale without duplicate effects", async ({
    page,
    context,
  }) => {
    const warmCustomerId = await api.createCustomer(uniqueCustomerName("offline-warm"));
    await signIn(page);
    await page.goto(`/customers/${warmCustomerId}/sales/new`);
    await page.waitForURL(/localSaleId=/);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Mặt hàng" })).toBeVisible();
    await chooseProduct(page, "Cà chua");
    await page.goto("/sales/new");
    await expect(page.getByLabel("Tìm khách hàng")).toBeVisible();

    await context.setOffline(true);
    const customerName = uniqueCustomerName("offline-inline");
    await page.getByLabel("Tìm khách hàng").fill(customerName);
    await page.getByRole("button", { name: new RegExp(`Tạo khách`) }).click();
    await page.getByRole("button", { name: "Tạo khách và ghi đơn" }).click();
    await page.waitForURL(/\/sales\/new\?offlineCustomerId=[0-9a-f-]+/);
    const customerId = new URL(page.url()).searchParams.get("offlineCustomerId")!;
    await expect(page.getByText(/Khách mới đang lưu trên thiết bị/)).toBeVisible();

    await context.setOffline(false);
    await chooseProduct(page, "Cà chua");
    await chooseOption(page, "Hạng hàng", "Loại 1");
    await page.getByLabel("Số lượng").fill("3");
    await page.getByLabel("Đơn giá").fill("15.000");
    await context.setOffline(true);
    await page.getByRole("button", { name: "Chốt đơn", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Chốt đơn", exact: true }).click();
    await expect(page.getByText(/Đã lưu trên thiết bị/)).toBeVisible();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(async () => (await api.sales(customerId)).items.length, { timeout: 20_000 })
      .toBe(1);
    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    expect(sales.items[0]?.status).toBe("posted");
  });
});
