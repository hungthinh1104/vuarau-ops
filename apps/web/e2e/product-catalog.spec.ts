import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

async function chooseOption(page: Parameters<typeof signIn>[0], label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function chooseCatalogProduct(
  page: Parameters<typeof signIn>[0],
  query: string,
  productName: string,
): Promise<void> {
  await page.getByRole("button", { name: "Mở bảng chọn mặt hàng và giá gần đây" }).click();
  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await picker.getByLabel("Tìm mặt hàng").fill(query);
  const product = picker.getByRole("button", { name: new RegExp(`^${productName} · kg$`) });
  await product.focus();
  await product.press("Enter");
}

test.describe("Product catalog", () => {
  test("catalog changes never rewrite a posted Sale snapshot and unresolved text must be resolved", async ({
    page,
  }) => {
    await signIn(page, "owner");
    await page.goto("/products/new");
    const uniqueSuffix = Date.now();
    const name = `Cải bẹ M15 ${uniqueSuffix}`;
    const alias = `cai be ${uniqueSuffix}`;
    await page.getByLabel("Tên mặt hàng").fill(name);
    await page.getByLabel("Tên gọi khác").fill(alias);
    await chooseOption(page, "Đơn vị gợi ý", "kg");
    await page.getByRole("button", { name: "Tạo mặt hàng" }).click();
    await page.waitForURL(/\/products\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByLabel("Tên mặt hàng")).toHaveValue(name);
    const productUrl = page.url();

    await page.goto("/products");
    await page.getByLabel("Tìm mặt hàng").fill(alias);
    const catalogName =
      (page.viewportSize()?.width ?? 0) >= 1024
        ? page.getByRole("cell", { name, exact: true })
        : page.getByRole("link", { name: new RegExp(name) });
    await expect(catalogName).toBeVisible();

    const customerId = await api.createCustomer(uniqueCustomerName("product-sale"));
    await page.goto(`/customers/${customerId}/sales/new`);
    const line = page.getByTestId("sale-line-0");
    await chooseCatalogProduct(page, alias, name);
    await expect(line.getByRole("textbox", { name: "Mặt hàng" })).toHaveValue(name);
    await expect(line.getByRole("combobox", { name: "Đơn vị" })).toContainText("kg");
    await expect(line.getByLabel("Đơn giá")).toHaveValue("");
    await chooseOption(page, "Hạng hàng", "Loại 1");
    await line.getByLabel("Số lượng").fill("2");
    await line.getByLabel("Đơn giá").fill("20.000");
    await page.getByRole("button", { name: "Chốt đơn", exact: true }).click();
    const confirmation = page
      .getByRole("dialog")
      .getByRole("button", { name: "Chốt đơn", exact: true });
    await confirmation.focus();
    await confirmation.press("Enter");
    await expect(page.getByRole("heading", { name: /^Đơn của / })).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText("2 kg × 20.000 ₫")).toBeVisible();
    const saleUrl = page.url();

    const renamed = `${name} đổi tên`;
    await page.goto(productUrl);
    await page.getByLabel("Tên mặt hàng").fill(renamed);
    await chooseOption(page, "Đơn vị gợi ý", "cái");
    await page.getByRole("button", { name: "Cập nhật mặt hàng" }).click();
    await expect(page.getByText("Đã ghi nhận", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ngưng mặt hàng" }).click();
    await expect(page.getByRole("button", { name: "Dùng lại mặt hàng" })).toBeVisible();

    await page.goto(saleUrl);
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText("2 kg × 20.000 ₫")).toBeVisible();
    await expect(page.getByText(renamed)).toHaveCount(0);

    const freeTextCustomerId = await api.createCustomer(uniqueCustomerName("free-text"));
    await page.goto(`/customers/${freeTextCustomerId}/sales/new`);
    const freeTextLine = page.getByTestId("sale-line-0");
    await freeTextLine.getByRole("textbox", { name: "Mặt hàng" }).fill(renamed);
    await expect(page.getByRole("button", { name: `${renamed} · cái`, exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText("Mặt hàng chưa có trong danh mục")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chốt đơn" })).toBeDisabled();

    const replacementName = `${renamed} mới`;
    await freeTextLine.getByRole("textbox", { name: "Mặt hàng" }).fill(replacementName);
    await page.getByRole("button", { name: /Tạo mặt hàng/ }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Tạo mặt hàng trong đơn" }),
    ).toBeVisible();
    await chooseOption(page, "Hạng hàng", "Loại 1");
    await freeTextLine.getByLabel("Số lượng").fill("1");
    await freeTextLine.getByLabel("Đơn giá").fill("10.000");
    await page.getByRole("button", { name: "Chốt đơn", exact: true }).click();
    const replacementConfirmation = page
      .getByRole("dialog")
      .getByRole("button", { name: "Chốt đơn", exact: true });
    await replacementConfirmation.focus();
    await replacementConfirmation.press("Enter");
    await expect(page.getByRole("heading", { name: /^Đơn của / })).toBeVisible();
    await expect(page.getByText(replacementName).first()).toBeVisible();
    await expect(page.getByText("1 kg × 10.000 ₫")).toBeVisible();
  });
});
