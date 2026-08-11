import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

// TC-E2E-033 / CASE-PAYMENT-008
test.describe("Durable offline payment", () => {
  test("TC-OFFLINE-003 / TC-E2E-033 — survives reload and records exactly one payment after reconnect", async ({
    page,
    context,
  }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("offline-payment"));

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);
    await expect(page.getByLabel("Số tiền khách trả")).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByLabel("Số tiền khách trả")).toBeVisible();

    await context.setOffline(true);
    await page.getByLabel("Số tiền khách trả").fill("200.000");
    await page.getByLabel("Ghi chú").fill("Thu tại quầy khi mất mạng");
    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
    await expect(page.getByText("Đã lưu trên thiết bị", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#offlinePaymentId=[0-9a-f-]+$/);

    await page.reload();
    await expect(page.getByText("Đã lưu trên thiết bị", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Số tiền khách trả")).toHaveValue("200000");
    await expect(page.getByRole("button", { name: "Ghi nhận thanh toán" })).toBeDisabled();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(async () => (await api.payments(customerId)).items.length, { timeout: 20_000 })
      .toBe(1);

    const payments = await api.payments(customerId);
    expect(payments.items).toHaveLength(1);
    expect(payments.items[0]?.amount.amountMinor).toBe(200_000);
    await expect(page).toHaveURL(/\/payments\/[0-9a-f-]+$/);
  });
});
