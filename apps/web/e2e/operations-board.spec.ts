import { api } from "./harness/api.ts";
import { expect, signIn, test } from "./harness/signed-in.ts";

async function chooseUnit(page: Parameters<typeof signIn>[0]): Promise<void> {
  await page.getByRole("combobox", { name: "Đơn vị gợi ý", exact: true }).click();
  await page.getByRole("option", { name: "kg", exact: true }).click();
}

test.describe("Operations board production pagination", () => {
  test("loads the next stable cursor page without a full reload", async ({ page }) => {
    await signIn(page, "owner");
    const suffix = Date.now();
    const productName = `Mặt hàng board ${suffix}`;
    await api.resetOperationalHistoryForProfileFixture();
    const previousQualityGradeMode = await api.setQualityGradeMode("disabled");

    try {
      await page.goto("/products/new");
      await page.getByLabel("Tên mặt hàng").fill(productName);
      await chooseUnit(page);
      await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
      await page.waitForURL(/\/products\/[0-9a-f-]+$/);
      const productId = new URL(page.url()).pathname.split("/").at(-1)!;

      for (let index = 0; index < 26; index += 1) {
        const customerId = await api.createCustomer(`Khách board ${suffix}-${index}`);
        await api.createPostedSale({
          customerId,
          productId,
          productName,
          quantityScaled: 1_000,
          qualityGradeId: null,
        });
      }

      await page.goto("/operations-board");
      await expect(page.getByRole("heading", { name: "Bảng điều hành" })).toBeVisible();
      const boardItems = page.getByRole("list", { name: "Việc cần xử lý" }).getByRole("link");
      await expect(boardItems).toHaveCount(25);
      await page.getByRole("button", { name: "Tải thêm" }).click();
      await expect.poll(() => boardItems.count()).toBeGreaterThan(25);
    } finally {
      await api.setQualityGradeMode(previousQualityGradeMode);
    }
  });

  test("TC-E2E-034 — preserves an unallocated payment until the operator resolves it", async ({
    page,
  }) => {
    await signIn(page, "owner");
    const suffix = Date.now();
    const productName = `Mặt hàng unresolved ${suffix}`;
    await api.resetOperationalHistoryForProfileFixture();
    const previousQualityGradeMode = await api.setQualityGradeMode("disabled");

    try {
      await page.goto("/products/new");
      await page.getByLabel("Tên mặt hàng").fill(productName);
      await chooseUnit(page);
      await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
      await page.waitForURL(/\/products\/[0-9a-f-]+$/);
      const productId = new URL(page.url()).pathname.split("/").at(-1)!;

      const customerId = await api.createCustomer(`Khách unresolved ${suffix}`);
      const { saleId } = await api.createPostedSale({
        customerId,
        productId,
        productName,
        quantityScaled: 50_000,
        qualityGradeId: null,
      });

      await page.goto(`/customers/${customerId}/payments/new`);
      await page.getByLabel("Số tiền khách trả").fill("500.000");
      await page.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
      await expect(page).toHaveURL(/\/payments\/[0-9a-f-]+$/);
      const payment = await api.payments(customerId);
      const paymentId = payment.items.at(-1)?.id;
      expect(paymentId).toBeDefined();

      const before = await api.closeReadiness();
      expect(before.blockers).toContain("blocking_exception");
      expect(before.exceptionSummary).toContainEqual(
        expect.objectContaining({ kind: "unallocated_payment", count: 1 }),
      );

      await page.goto("/today");
      await page.getByRole("link", { name: "Bảng điều hành" }).first().click();
      await expect(page.getByRole("heading", { name: "Bảng điều hành" })).toBeVisible();
      const unallocatedFilter = page.getByRole("button", { name: /Tiền chưa phân bổ/ });
      await unallocatedFilter.click();
      await expect(unallocatedFilter).toHaveAttribute("aria-pressed", "true");
      const mobileBoard = page.getByRole("list", { name: "Việc cần xử lý" });
      await expect(
        mobileBoard.getByRole("link", { name: new RegExp(`PAY-${paymentId!.slice(0, 8)}`, "i") }),
      ).toBeVisible();
      const explanation = mobileBoard
        .locator("details")
        .filter({ hasText: "Đã nhận tiền nhưng chưa biết khoản tiền thuộc Sale hay tín dụng nào." })
        .first();
      await explanation.getByText("Vì sao cần xử lý?").click();
      await expect(
        explanation.getByText("Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(explanation.getByText("Điều chưa biết")).toBeVisible();
      await expect(explanation.getByText("Phân bổ vào Sale", { exact: true })).toBeVisible();
      await expect(explanation.getByText("Tiền chưa phân bổ (đơn vị nhỏ nhất)")).toBeVisible();
      await expect(explanation.getByRole("link", { name: "Mở bước xử lý" })).toHaveAttribute(
        "href",
        `/payments/${paymentId}`,
      );

      // The Board's source link identifies the Payment; the allocation command
      // is the explicit resolution fact and never changes the goods quantity.
      await expect(
        mobileBoard
          .getByRole("link", { name: new RegExp(`PAY-${paymentId!.slice(0, 8)}`, "i") })
          .first(),
      ).toHaveAttribute("href", `/payments/${paymentId}`);
      await expect(
        mobileBoard.getByRole("link", { name: new RegExp(`SALE-${saleId.slice(0, 8)}`, "i") }),
      ).toHaveCount(0);
      await api.approvePaymentAllocationPolicy();
      await api.allocatePayment({ paymentId: paymentId!, saleId, amountMinor: 500_000 });

      await page.goto("/operations-board?filter=unallocated_payment");
      await expect(page.getByRole("button", { name: /Tiền chưa phân bổ/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByText("Không có đơn trong bộ lọc")).toBeVisible();

      const after = await api.closeReadiness();
      expect(after.blockers).not.toContain("blocking_exception");
      expect(after.exceptionSummary).not.toContainEqual(
        expect.objectContaining({ kind: "unallocated_payment" }),
      );
    } finally {
      await api.setQualityGradeMode(previousQualityGradeMode);
    }
  });
});
