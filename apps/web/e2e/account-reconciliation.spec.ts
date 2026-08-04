import { expect, signIn, test } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

test.describe("TC-E2E-023 — account reconciliation", () => {
  test("detects projection drift, exports evidence, and repairs without touching the ledger", async ({
    page,
  }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("M10"));
    await api.openingBalance(customerId, 500_000);
    const entriesBefore = (await api.timeline(customerId)).items;
    expect(entriesBefore).toHaveLength(1);
    await api.corruptProjection(customerId, 999_999, 99);

    await signIn(page, "owner");
    await page.goto(`/customers/${customerId}/account/reconciliation`);
    await expect(page.getByRole("heading", { name: "Giải thích công nợ" })).toBeVisible();
    await expect(page.getByText("Có sai lệch", { exact: true })).toBeVisible();
    await expect(page.getByText("999.999 ₫", { exact: true })).toBeVisible();
    await expect(page.getByText("500.000 ₫", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Xuất bằng chứng JSON" }).click();
    await expect(page.getByText("Bằng chứng đối soát", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Bằng chứng JSON" })).toContainText(
      "projection_balance_mismatch",
    );

    await page.getByRole("button", { name: "Dựng lại số dư" }).click();
    await expect(page.getByText("Đã ghi nhận", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tải kết quả đối soát mới" }).click();
    await expect(page.getByText("Khớp", { exact: true })).toBeVisible();

    const reconciled = await api.reconciliation(customerId);
    expect(reconciled.kind).toBe("consistent");
    expect(reconciled.ledger?.balance.amountMinor).toBe(500_000);
    expect(reconciled.projection?.balance.amountMinor).toBe(500_000);
    expect((await api.timeline(customerId)).items).toEqual(entriesBefore);
  });
});
