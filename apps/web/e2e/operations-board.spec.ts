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
      const footer = page.getByText(/Đang hiện \d+ đơn\./);
      await expect(footer).toHaveText("Đang hiện 25 đơn.");
      await page.getByRole("button", { name: "Tải thêm" }).click();
      await expect
        .poll(async () => Number((await footer.textContent())?.match(/\d+/)?.[0] ?? 0))
        .toBeGreaterThan(25);
    } finally {
      await api.setQualityGradeMode(previousQualityGradeMode);
    }
  });
});
