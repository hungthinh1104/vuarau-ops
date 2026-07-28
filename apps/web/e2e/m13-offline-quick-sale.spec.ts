import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

test.describe("M13 — durable offline Quick Sale", () => {
  test("survives offline reload and synchronizes exactly one posting", async ({
    page,
    context,
  }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("offline"));
    await signIn(page);
    await page.goto(`/customers/${customerId}/sales/new`);
    await expect(page.getByLabel("Mặt hàng")).toBeVisible();
    await page.waitForURL(/localSaleId=/);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The first visit installs the shell worker. One controlled online reload
    // lets it cache this route and its hashed Next assets before connectivity
    // disappears.
    await page.reload();
    await expect(page.getByLabel("Mặt hàng")).toBeVisible();

    await page.getByLabel("Mặt hàng").fill("Rau muống offline");
    await page.getByLabel("Số lượng").fill("10");
    await page.getByLabel("Đơn giá").fill("12.000");
    await page.getByLabel("Ghi chú").fill("Ảnh chụp bất biến trên thiết bị");
    await page.waitForTimeout(250);

    // A local draft has no frozen command yet, so reload must preserve it
    // without taking away the worker's ability to continue editing.
    await page.reload();
    await expect(page.getByLabel("Mặt hàng")).toHaveValue("Rau muống offline");
    await expect(page.getByLabel("Mặt hàng")).toBeEnabled();
    await expect(page.getByRole("button", { name: "+ Thêm dòng" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeEnabled();

    await context.setOffline(true);
    await page.getByRole("button", { name: "+ Thêm dòng" }).click();
    const secondLine = page.getByTestId("sale-line-1");
    await secondLine.getByLabel("Mặt hàng").fill("Cải ngọt offline");
    await secondLine.getByLabel("Số lượng").fill("2");
    await secondLine.getByLabel("Đơn giá").fill("15.000");
    await page.getByRole("button", { name: "Chốt đơn" }).dblclick();
    await expect(page.getByText(/Đã lưu trên thiết bị/)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("sale-line-0").getByLabel("Mặt hàng")).toHaveValue(
      "Rau muống offline",
    );
    await expect(
      page.getByText("Đã lưu trên thiết bị · chờ máy chủ", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Đơn đã được lưu an toàn trên thiết bị.")).toBeVisible();
    await expect(page.getByText(/Đang dùng danh mục đã lưu lúc/)).toBeVisible();
    await expect(page.getByTestId("sale-line-0").getByLabel("Mặt hàng")).toBeDisabled();
    await expect(page.getByTestId("sale-line-0").getByLabel("Số lượng")).toBeDisabled();
    await expect(page.getByTestId("sale-line-0").getByLabel("Đơn vị")).toBeDisabled();
    await expect(page.getByTestId("sale-line-0").getByLabel("Đơn giá")).toBeDisabled();
    await expect(page.getByTestId("sale-line-1").getByLabel("Mặt hàng")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Xoá dòng 2" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "+ Thêm dòng" })).toBeDisabled();
    await expect(page.getByLabel("Ghi chú")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Lưu nháp" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Chốt đơn" })).toBeDisabled();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible({
      timeout: 20_000,
    });

    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    const posted = await api.sale(sales.items[0]!.id);
    expect(posted.note).toBe("Ảnh chụp bất biến trên thiết bị");
    expect(posted.lines).toMatchObject([
      {
        productName: "Rau muống offline",
        quantity: { valueScaled: 10_000, unit: "kg" },
        unitPrice: { amountMinor: 12_000, currency: "VND" },
      },
      {
        productName: "Cải ngọt offline",
        quantity: { valueScaled: 2_000, unit: "kg" },
        unitPrice: { amountMinor: 15_000, currency: "VND" },
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
    await expect(page.getByLabel("Mặt hàng")).toBeVisible();
    await page.getByRole("link", { name: "Ghi đơn nhanh" }).click();
    await expect(page.getByLabel("Tìm khách hàng")).toBeVisible();

    await context.setOffline(true);
    const customerName = uniqueCustomerName("offline-inline");
    await page.getByLabel("Tìm khách hàng").fill(customerName);
    await page.getByRole("button", { name: new RegExp(`Tạo khách`) }).click();
    await page.getByRole("button", { name: "Tạo khách và ghi đơn" }).click();
    await page.waitForURL(/\/sales\/new\?offlineCustomerId=[0-9a-f-]+/);
    const customerId = new URL(page.url()).searchParams.get("offlineCustomerId")!;
    await expect(page.getByText(/Khách mới đang lưu trên thiết bị/)).toBeVisible();

    await page.getByLabel("Mặt hàng").fill("Hàng offline khách mới");
    await page.getByLabel("Số lượng").fill("3");
    await page.getByLabel("Đơn giá").fill("15.000");
    await page.getByRole("button", { name: "Chốt đơn" }).click();
    await expect(page.getByText(/Đã lưu trên thiết bị/)).toBeVisible();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible({
      timeout: 20_000,
    });
    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    expect(sales.items[0]?.status).toBe("posted");
  });
});
