import type { Page } from "@playwright/test";
import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

async function postSale(page: Page, customerId: string): Promise<void> {
  await page.goto(`/customers/${customerId}/sales/new`);
  const line = page.getByTestId("sale-line-0");
  await line.getByLabel("Mặt hàng").fill("M9 rau kiểm thử");
  await line.getByLabel("Số lượng").fill("1");
  await line.getByLabel("Đơn giá").fill("500.000");
  await page.getByRole("button", { name: "Chốt đơn" }).click();
  await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();
}

test.describe("TC-E2E-022 — M9 account ledger truth", () => {
  test("keeps four effects, source navigation, retries and authorization coherent end to end", async ({
    page,
  }) => {
    const customerName = uniqueCustomerName("M9");
    const customerId = await api.createCustomer(customerName);
    await signIn(page, "owner");

    await postSale(page, customerId);
    const sale = (await api.sales(customerId)).items.at(0);
    expect(sale?.totalAmount.amountMinor).toBe(500_000);
    if (sale === undefined) return;

    await page.goto(`/customers/${customerId}/payments/new`);
    await page.getByLabel("Số tiền khách trả").fill("200.000");
    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();
    const payment = (await api.payments(customerId)).items.at(0);
    if (payment === undefined) return;

    await page.getByLabel("Số tiền hoàn").fill("50.000");
    await page.getByLabel("Lý do hoàn tác").fill("Khách đổi tiền lẻ");
    await page.getByRole("button", { name: "Xác nhận hoàn tác" }).click();
    await expect(page.getByRole("status").getByText("Đã ghi nhận")).toBeVisible();

    await page.goto(`/customers/${customerId}/account/adjust`);
    await page.getByLabel("Hướng điều chỉnh").selectOption("decrease");
    await page.getByLabel("Lý do").selectOption("goodwill_discount");
    await page.getByLabel("Số tiền điều chỉnh").fill("20.000");
    await page.getByLabel("Giải thích").fill("Giảm trừ đã duyệt");
    await page
      .getByRole("button", { name: "Xác nhận điều chỉnh" })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    await page.waitForURL(/\/account-adjustments\//);
    const adjustmentId = new URL(page.url()).pathname.split("/").at(-1);
    expect(adjustmentId).toBeTruthy();
    if (adjustmentId === undefined) return;

    // The duplicate tap reused the command identity and cannot create a fifth effect.
    await page.reload();
    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(330_000);
    const timeline = await api.timeline(customerId);
    const oldestFirst = [...timeline.items].reverse();
    expect(oldestFirst.map((entry) => entry.amount.amountMinor)).toEqual([
      500_000, -200_000, 50_000, -20_000,
    ]);
    expect(oldestFirst.map((entry) => entry.runningBalance.amountMinor)).toEqual([
      500_000, 300_000, 350_000, 330_000,
    ]);
    expect(timeline.items).toHaveLength(4);

    // Each rendered timeline source points to the detail endpoint that owns it.
    await page.goto(`/customers/${customerId}`);
    const accountTimeline = page.getByRole("list", { name: "Giao dịch công nợ" });
    await expect(accountTimeline.locator(`a[href="/sales/${sale.id}"]`)).toBeVisible();
    await expect(accountTimeline.locator(`a[href="/payments/${payment.id}"]`)).toHaveCount(2);
    await expect(
      accountTimeline.locator(`a[href="/account-adjustments/${adjustmentId}"]`),
    ).toBeVisible();
    await accountTimeline.locator(`a[href="/sales/${sale.id}"]`).click();
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();
    await page.goto(`/customers/${customerId}`);
    await page
      .getByRole("list", { name: "Giao dịch công nợ" })
      .locator(`a[href="/payments/${payment.id}"]`)
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();
    await page.goto(`/customers/${customerId}`);
    await page
      .getByRole("list", { name: "Giao dịch công nợ" })
      .locator(`a[href="/account-adjustments/${adjustmentId}"]`)
      .click();
    await expect(page.getByText("−20.000 ₫")).toBeVisible();

    // Sales can read the account but cannot reverse or adjust it.
    await signIn(page, "sales");
    await page.goto(`/customers/${customerId}`);
    await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
    await expect(page.getByText("Sổ công nợ")).toBeVisible();
    await expect(page.getByRole("link", { name: "Điều chỉnh công nợ" })).toHaveCount(0);
    await page.goto(`/payments/${payment.id}`);
    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xác nhận hoàn tác" })).toHaveCount(0);
    await page.goto(`/customers/${customerId}/account/adjust`);
    await expect(page.getByText("Không đủ quyền", { exact: true })).toBeVisible();

    await api.expectWorkspaceAccessDenied(customerId);
  });
});
