import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { E2E_WORKSPACE_NAME, uniqueCustomerName } from "./harness/environment.ts";

/**
 * M5A — the payment workflow, against a real API and a real database.
 *
 * Every assertion that matters is made **twice**: once about what the screen
 * says, and once about what the database holds, read back through the API. A test
 * that only checked the screen would pass while the server wrote two rows.
 */

async function customerOwing(label: string, amountMinor: number): Promise<string> {
  const customerId = await api.createCustomer(uniqueCustomerName(label));
  await api.openingBalance(customerId, amountMinor);
  return customerId;
}

test.describe("TC-E2E-001 — find and open a customer", () => {
  test("searching by name finds the customer and shows what they owe", async ({ page }) => {
    const name = uniqueCustomerName("A");
    const customerId = await api.createCustomer(name);
    await api.openingBalance(customerId, 1_200_000);

    await signIn(page);
    await page.goto("/customers");

    await page.getByLabel("Tìm khách hàng").fill(name);
    const row = page.getByRole("link", { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("1.200.000 ₫");

    await row.click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("Còn nợ", { exact: true })).toBeVisible();
  });
});

test.describe("TC-E2E-002 — exact payment", () => {
  test("paying the whole balance settles the account", async ({ page }) => {
    const customerId = await customerOwing("B", 500_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);

    await page.getByLabel("Số tiền khách trả").fill("500.000");
    // The preview is advisory, but it must agree with what the server will do.
    await expect(page.getByText("Hết nợ sau giao dịch")).toBeVisible();

    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();

    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();
    await expect(page.getByText("Hết nợ", { exact: true })).toBeVisible();

    // And the database agrees.
    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(0);
    expect(balance.classification).toBe("settled");
  });
});

test.describe("TC-E2E-003 — partial payment", () => {
  test("paying part of the balance leaves the rest owing", async ({ page }) => {
    const customerId = await customerOwing("C", 875_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);
    await page.getByLabel("Số tiền khách trả").fill("500.000");
    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();

    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(375_000);
    expect(balance.classification).toBe("receivable");
  });
});

test.describe("TC-E2E-004 — overpayment becomes customer credit", () => {
  test("paying more than owed reads as money the depot owes back", async ({ page }) => {
    const customerId = await customerOwing("D", 500_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);
    await page.getByLabel("Số tiền khách trả").fill("800.000");

    // Explained, not warned about: overpayment is valid (BR-ACCOUNT-007).
    await expect(page.getByText(/Khách trả dư/)).toBeVisible();
    await expect(page.getByText("Vựa nợ khách sau giao dịch")).toBeVisible();

    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();

    // The screen must never say "nợ −300.000".
    await expect(page.getByText("Vựa nợ khách", { exact: true })).toBeVisible();
    await expect(page.getByText(/[-−]\s?300\.000/)).toHaveCount(0);

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(-300_000);
    expect(balance.classification).toBe("customer_credit");
  });
});

test.describe("TC-E2E-005 — permission denied", () => {
  test("a warehouse worker cannot record a payment, and is told why", async ({ page }) => {
    const customerId = await customerOwing("E", 500_000);

    // `warehouse` holds `customer.read` but not `payment.record` or `debt.read`.
    await signIn(page, "warehouse");
    await page.goto(`/customers/${customerId}/payments/new`);

    await expect(page.getByText("Không đủ quyền", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ghi nhận thanh toán" })).toBeDisabled();

    // Nothing moved.
    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(500_000);
  });
});

test.describe("TC-E2E-006 — duplicate tap", () => {
  test("two taps in the same tick record exactly one payment", async ({ page }) => {
    const customerId = await customerOwing("F", 900_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);
    await page.getByLabel("Số tiền khách trả").fill("400.000");

    /*
     * Both clicks in one task, before React can re-render the button as
     * disabled. That is a genuine fat-fingered double tap, and it is the case
     * the idempotency key exists for: the second call finds the first still in
     * flight and resends its identity rather than minting a new one.
     *
     * `evaluate` rather than two `.click()` calls, which would each wait for the
     * button to be actionable and so could never overlap.
     */
    await page
      .getByRole("button", { name: "Ghi nhận thanh toán" })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });

    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();

    const payments = await api.payments(customerId);
    expect(payments.items).toHaveLength(1);
    expect(payments.items[0]?.amount.amountMinor).toBe(400_000);

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(500_000);
  });

  test("a tap after the server said yes does not record a second payment", async ({ page }) => {
    const customerId = await customerOwing("J", 900_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);
    await page.getByLabel("Số tiền khách trả").fill("400.000");

    /*
     * The gap this covers is not a race inside one tick — it is the ~150 ms
     * between the server committing and the route changing, during which the
     * button is still on screen. Two intentions with two keys are
     * indistinguishable from two real payments, so the client must refuse; the
     * server cannot.
     *
     * This is the case that produced a duplicate before the `settled` guard.
     */
    const confirm = page.getByRole("button", { name: "Ghi nhận thanh toán" });
    await confirm.dispatchEvent("click");
    await expect(page.getByText("Đã ghi nhận", { exact: true })).toBeVisible();
    await confirm.dispatchEvent("click").catch(() => undefined);

    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();

    const payments = await api.payments(customerId);
    expect(payments.items).toHaveLength(1);
  });
});

test.describe("TC-E2E-007 — unknown outcome then duplicate-safe success", () => {
  test("a dropped connection, then a resend, records exactly one payment", async ({ page }) => {
    const customerId = await customerOwing("G", 700_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);
    await page.getByLabel("Số tiền khách trả").fill("300.000");

    /*
     * Abort the *response*, not the request. The command reaches the server and
     * commits; the browser never hears back. That is the case the whole design
     * exists for, and it is indistinguishable from a real 4G drop.
     */
    let dropped = false;
    await page.route("**/trpc/payment.record**", async (route) => {
      if (!dropped) {
        dropped = true;
        await route.fetch().catch(() => undefined);
        await route.abort("connectionaborted");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();

    await expect(page.getByText("Chưa rõ kết quả")).toBeVisible();
    // Called unconfirmed, never failed: "thất bại" invites a fresh attempt.
    await expect(page.getByText(/thất bại/i)).toHaveCount(0);

    const keyBefore = await page.getByTestId("idempotency-key").textContent();

    await page.getByRole("button", { name: "Gửi lại" }).click();
    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();

    // One payment, not two — because the resend carried the original key.
    const payments = await api.payments(customerId);
    expect(payments.items).toHaveLength(1);
    expect(payments.items[0]?.amount.amountMinor).toBe(300_000);
    expect(keyBefore).not.toBeNull();

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(400_000);
  });
});

test.describe("TC-E2E-008 — a rejection keeps what was typed", () => {
  test("a refused amount leaves the form exactly as entered", async ({ page }) => {
    const customerId = await customerOwing("H", 500_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);

    await page.getByLabel("Số tiền khách trả").fill("0");
    await page.getByLabel("Người trả (nếu không phải khách)").fill("Anh Dũng, con chị Lan");
    await page.getByLabel("Ghi chú").fill("Trả tại kho lúc sáng");

    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();

    await expect(page.getByText("Số tiền phải lớn hơn 0.")).toBeVisible();
    // Every field still holds what was typed. Losing this is how people go back
    // to paper.
    await expect(page.getByLabel("Số tiền khách trả")).toHaveValue("0");
    await expect(page.getByLabel("Người trả (nếu không phải khách)")).toHaveValue(
      "Anh Dũng, con chị Lan",
    );
    await expect(page.getByLabel("Ghi chú")).toHaveValue("Trả tại kho lúc sáng");

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(500_000);
  });
});

test.describe("TC-E2E-009 — the timeline shows the committed transaction", () => {
  test("the payment appears in the account timeline with the same amount", async ({ page }) => {
    const customerId = await customerOwing("I", 1_000_000);

    await signIn(page);
    await page.goto(`/customers/${customerId}/payments/new`);
    await page.getByLabel("Số tiền khách trả").fill("250.000");
    await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
    await expect(page.getByRole("heading", { name: "Đã ghi nhận thanh toán" })).toBeVisible();

    await page.getByRole("link", { name: "Xem sổ công nợ khách hàng" }).click();

    await expect(page.getByRole("heading", { name: "Sổ công nợ", exact: true })).toBeVisible();
    await expect(page.getByText("Thu tiền")).toBeVisible();
    await expect(page.getByText("−250.000 ₫")).toBeVisible();

    const timeline = await api.timeline(customerId);
    const payment = timeline.items.find((entry) => entry.source.type === "payment");
    expect(payment?.amount.amountMinor).toBe(-250_000);
  });
});

test.describe("TC-E2E-010 — the workspace is chosen explicitly", () => {
  test("no depot is selected silently, even when the server returns exactly one", async ({
    page,
  }) => {
    // Signed in, but with no workspace stored.
    await signIn(page);
    await page.addInitScript(() => window.sessionStorage.removeItem("vuarau.workspace_id"));
    await page.goto("/customers");

    await expect(page.getByRole("heading", { name: "Chọn vựa" })).toBeVisible();
    await expect(page.getByText(/sẽ được ghi vào vựa bạn chọn/)).toBeVisible();

    await page.getByRole("button", { name: E2E_WORKSPACE_NAME }).click();
    await expect(page.getByRole("heading", { name: "Khách hàng" })).toBeVisible();
  });
});
