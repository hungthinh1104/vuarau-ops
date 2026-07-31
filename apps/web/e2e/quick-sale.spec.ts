import type { Page } from "@playwright/test";
import { expect, test, signIn } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";
import { uniqueCustomerName } from "./harness/environment.ts";

/**
 * M5B — the quick sale, against a real API and a real database.
 *
 * The workflow this milestone exists to validate, so the assertions are about the
 * two things a depot would lose money on: **exactly one account effect per posted
 * sale**, and **nothing typed is ever lost**.
 */

type Line = { product: string; quantity: string; unit?: string; price: string };

async function fillLine(page: Page, index: number, line: Line): Promise<void> {
  const row = page.getByTestId(`sale-line-${index}`);
  await row.getByLabel("Mặt hàng").fill(line.product);
  await row.getByRole("button", { name: "Chọn" }).click();
  const picker = page.getByRole("dialog", { name: "Chọn mặt hàng" });
  await expect(picker).toBeVisible();
  const catalog = picker.getByRole("heading", { name: "Danh mục chung" }).locator("..");
  await catalog
    .getByRole("button", {
      name: new RegExp(`^${line.product.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?: · .+)?$`),
    })
    .click();
  await expect(picker).toBeHidden();
  await row.getByLabel("Phân hạng chất lượng").selectOption({ label: "Loại 1" });
  await row.getByLabel("Số lượng").fill(line.quantity);
  if (line.unit !== undefined) await row.getByLabel("Đơn vị").selectOption(line.unit);
  await row.getByLabel("Đơn giá").fill(line.price);
}

async function openPostConfirmation(page: Page) {
  await page.getByRole("button", { name: "Chốt đơn", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Xác nhận chốt đơn" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function confirmPost(page: Page): Promise<void> {
  const dialog = await openPostConfirmation(page);
  await dialog.getByRole("button", { name: "Chốt đơn", exact: true }).click();
}

async function startSale(page: Page, label: string): Promise<string> {
  const customerId = await api.createCustomer(uniqueCustomerName(label));
  await signIn(page);
  await page.goto(`/customers/${customerId}/sales/new`);
  return customerId;
}

test.describe("TC-E2E-011 — a one-line sale", () => {
  test("posting creates one sale and one account entry", async ({ page }) => {
    const customerId = await startSale(page, "S1");

    // A draft must say, in words, that nobody owes anything yet.
    await expect(page.getByText(/chưa tính vào công nợ/)).toBeVisible();

    await fillLine(page, 0, { product: "Cà chua", quantity: "12,5", price: "18.000" });
    await expect(page.getByTestId("sale-total")).toHaveText("225.000 ₫");

    await confirmPost(page);

    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();
    await expect(page.getByTestId("posted-total")).toHaveText("225.000 ₫");

    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    expect(sales.items[0]?.status).toBe("posted");
    expect(sales.items[0]?.totalAmount.amountMinor).toBe(225_000);

    // Exactly one entry, of exactly the total (BR-SALE-007).
    const timeline = await api.timeline(customerId);
    const postings = timeline.items.filter((entry) => entry.source.type === "sale_posting");
    expect(postings).toHaveLength(1);
    expect(postings[0]?.amount.amountMinor).toBe(225_000);

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(225_000);
  });
});

test.describe("TC-E2E-012 — a three-line sale", () => {
  test("totals the casebook load and keeps each unit as entered", async ({ page }) => {
    const customerId = await startSale(page, "S2");

    // CASE-SALE-001, the numbers the backend tests use.
    await fillLine(page, 0, { product: "Cà chua", quantity: "12,5", unit: "kg", price: "18.000" });
    await page.getByRole("button", { name: "+ Thêm dòng" }).click();
    await fillLine(page, 1, { product: "Rau muống", quantity: "30", unit: "bo", price: "5.000" });
    await page.getByRole("button", { name: "+ Thêm dòng" }).click();
    await fillLine(page, 2, { product: "Ớt hiểm", quantity: "2", unit: "thung", price: "250.000" });

    await expect(page.getByTestId("sale-total")).toHaveText("875.000 ₫");

    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    // Units are displayed exactly as entered; nothing is converted (ASM-011).
    await expect(page.getByText("12,5 kg × 18.000 ₫")).toBeVisible();
    await expect(page.getByText("30 bó × 5.000 ₫")).toBeVisible();
    await expect(page.getByText("2 thùng × 250.000 ₫")).toBeVisible();

    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    expect(sales.items[0]?.lineCount).toBe(3);
    expect(sales.items[0]?.totalAmount.amountMinor).toBe(875_000);
  });
});

test.describe("TC-E2E-013 — an empty sale is refused", () => {
  test("posting with no lines filled in says what to fix and writes nothing", async ({ page }) => {
    const customerId = await startSale(page, "S3");

    const postButton = page.getByRole("button", { name: "Chốt đơn" });
    await expect(postButton).toBeDisabled();
    await expect(postButton).toHaveAttribute(
      "title",
      "Chọn mặt hàng trong danh mục và phân hạng chất lượng cho mọi dòng.",
    );

    // Nothing reached the server: no draft, no sale, no account entry.
    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(0);
    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(0);
  });
});

test.describe("TC-E2E-014 — an invalid line is flagged on its own row", () => {
  test("the error attaches to the row that is wrong, not to the form", async ({ page }) => {
    const customerId = await startSale(page, "S4");

    await fillLine(page, 0, { product: "Cà chua", quantity: "10", price: "18.000" });
    await page.getByRole("button", { name: "+ Thêm dòng" }).click();
    // Second row: a quantity of zero, which BR-SALE-003 refuses.
    await fillLine(page, 1, { product: "Rau muống", quantity: "0", price: "5.000" });

    await confirmPost(page);

    const secondRow = page.getByTestId("sale-line-1");
    await expect(secondRow.getByText(/Số lượng phải lớn hơn 0/)).toBeVisible();
    // The good row is untouched — a form-level error would have sent the worker
    // hunting through both.
    await expect(page.getByTestId("sale-line-0").getByText(/Số lượng phải lớn hơn/)).toHaveCount(0);

    // And the first row still holds what was typed.
    await expect(page.getByTestId("sale-line-0").getByLabel("Mặt hàng")).toHaveValue("Cà chua");

    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(0);
  });
});

test.describe("TC-E2E-015 — editing and discarding a draft", () => {
  test("a saved draft can be edited, and creates no debt while it is a draft", async ({ page }) => {
    const customerId = await startSale(page, "S5");

    await fillLine(page, 0, { product: "Cà chua", quantity: "10", price: "18.000" });
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page.getByText("Đã lưu nháp")).toBeVisible();

    // BR-SALE-010: a draft moves no money, however many times it is edited.
    let balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(0);

    await page.getByTestId("sale-line-0").getByLabel("Số lượng").fill("20");
    await expect(page.getByText("Có thay đổi chưa lưu")).toBeVisible();
    await expect(page.getByTestId("sale-total")).toHaveText("360.000 ₫");

    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page.getByText("Đã lưu nháp")).toBeVisible();

    balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(0);

    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    expect(sales.items[0]?.status).toBe("draft");
  });

  test("discarding a draft leaves it on the record and the balance untouched", async ({ page }) => {
    const customerId = await startSale(page, "S6");

    await fillLine(page, 0, { product: "Cà chua", quantity: "10", price: "18.000" });
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page.getByText("Đã lưu nháp")).toBeVisible();

    await page.getByRole("button", { name: "Bỏ đơn" }).click();
    await expect(page.getByRole("heading", { name: "Sổ công nợ", exact: true })).toBeVisible();

    // Kept, not deleted: somebody decided to throw it away, and that is record.
    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);
    expect(sales.items[0]?.status).toBe("discarded");

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(0);
  });
});

test.describe("TC-E2E-016 — a duplicate post does not duplicate the receivable", () => {
  test("tapping Chốt đơn twice leaves one sale and one account entry", async ({ page }) => {
    const customerId = await startSale(page, "S7");
    await fillLine(page, 0, { product: "Cà chua", quantity: "10", price: "18.000" });

    const confirmation = await openPostConfirmation(page);
    await confirmation
      .getByRole("button", { name: "Chốt đơn", exact: true })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });

    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    const sales = await api.sales(customerId);
    expect(sales.items).toHaveLength(1);

    const timeline = await api.timeline(customerId);
    expect(timeline.items.filter((entry) => entry.source.type === "sale_posting")).toHaveLength(1);

    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(180_000);
  });
});

test.describe("TC-E2E-017 — an unknown outcome on posting", () => {
  test("a dropped response is not a failure, and the resend keeps the identity", async ({
    page,
  }) => {
    const customerId = await startSale(page, "S8");
    await fillLine(page, 0, { product: "Cà chua", quantity: "10", price: "18.000" });

    // The post commits; the browser never hears back.
    let dropped = false;
    await page.route("**/trpc/sale.post**", async (route) => {
      if (!dropped) {
        dropped = true;
        await route.fetch().catch(() => undefined);
        await route.abort("connectionaborted");
        return;
      }
      await route.continue();
    });

    await confirmPost(page);

    await expect(page.getByText("Chưa rõ kết quả")).toBeVisible();
    // Unconfirmed, never failed. "Thất bại" is what makes somebody try again with
    // a fresh key.
    await expect(page.getByText(/thất bại/i)).toHaveCount(0);
    // And the lines are still there.
    await expect(page.getByTestId("sale-line-0").getByLabel("Mặt hàng")).toHaveValue("Cà chua");

    await page.getByRole("button", { name: "Gửi lại" }).click();
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    const timeline = await api.timeline(customerId);
    expect(timeline.items.filter((entry) => entry.source.type === "sale_posting")).toHaveLength(1);
  });
});

test.describe("TC-E2E-018 — permission and staleness", () => {
  test("a warehouse worker cannot post, and is told which permission is missing", async ({
    page,
  }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("S9"));

    await signIn(page, "warehouse");
    await page.goto(`/customers/${customerId}/sales/new`);

    await expect(page.getByText("Không đủ quyền", { exact: true })).toBeVisible();
    await expect(page.getByText("sale.create")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chốt đơn" })).toBeDisabled();
  });

  test("a draft changed elsewhere asks for a reload rather than retrying", async ({ page }) => {
    const customerId = await startSale(page, "S10");

    await fillLine(page, 0, { product: "Cà chua", quantity: "10", price: "18.000" });
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page.getByText("Đã lưu nháp")).toBeVisible();

    // Somebody else edits the same draft; this tab's version is now stale.
    const sales = await api.sales(customerId);
    const saleId = sales.items[0]!.id;
    await api.updateDraftElsewhere(saleId, sales.items[0]!.version);

    await page.getByTestId("sale-line-0").getByLabel("Số lượng").fill("20");
    await page.getByRole("button", { name: "Lưu nháp" }).click();

    await expect(page.getByText("Dữ liệu đã thay đổi")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tải lại" })).toBeVisible();
    // Reload, never a silent retry with the new version.
    await expect(page.getByText(/không tự gửi lại lệnh cũ/)).toBeVisible();
  });
});

test.describe("TC-E2E-019 — the posted sale and ledger agree", () => {
  test("the sale screen renders the server-projected account effect", async ({ page }) => {
    const customerId = await startSale(page, "S11");
    await fillLine(page, 0, { product: "Cà chua", quantity: "12,5", price: "18.000" });
    await confirmPost(page);

    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    // The screen renders the detail projection; it does not page or calculate a
    // timeline in the browser.
    await expect(page.getByText("Công nợ trước")).toBeVisible();
    await expect(page.getByText("Đơn này")).toBeVisible();
    await expect(page.getByText("Công nợ mới")).toBeVisible();
    const accountEffect = page.getByRole("heading", { name: "Ảnh hưởng công nợ" }).locator("..");
    await expect(accountEffect.getByText("225.000 ₫")).toHaveCount(2);

    const timeline = await api.timeline(customerId);
    const postings = timeline.items.filter((entry) => entry.source.type === "sale_posting");
    expect(postings).toHaveLength(1);
    expect(postings[0]?.amount.amountMinor).toBe(225_000);
  });
});

test.describe("TC-E2E-020 — analytics carry no business data", () => {
  test("workflow events name a metric and a number, and nothing else", async ({ page }) => {
    const customerId = await startSale(page, "S12");

    const events: string[] = [];
    page.on("console", (message) => {
      if (message.text().startsWith("[workflow]")) events.push(message.text());
    });

    await fillLine(page, 0, { product: "Ớt hiểm", quantity: "12,5", price: "18.000" });
    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    expect(events.length).toBeGreaterThan(0);
    const joined = events.join("\n");

    // No product name, no customer name, no amount, no id.
    expect(joined).not.toContain("Ớt hiểm");
    expect(joined).not.toContain("225000");
    expect(joined).not.toContain("225.000");
    expect(joined).not.toContain(customerId);
    // Every event is `metric=number`.
    for (const event of events) {
      expect(event).toMatch(/^\[workflow] [a-z_]+=\d+$/);
    }
  });
});

test.describe("TC-E2E-021 — an owner corrects a posted sale", () => {
  test("voids the old sale, preloads a replacement, and records only the replacement amount", async ({
    page,
  }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("S13"));
    await signIn(page, "owner");
    await page.goto(`/customers/${customerId}/sales/new`);

    await fillLine(page, 0, { product: "Ớt hiểm", quantity: "10", price: "12.000" });
    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    await page.getByRole("combobox", { name: "Loại điều chỉnh" }).selectOption("wrong_amount");
    await page.getByRole("textbox", { name: /Lý do điều chỉnh/ }).fill("Nhập sai đơn giá");
    await page.getByRole("checkbox", { name: /Tạo đơn thay thế sau khi void/ }).check();
    await page.getByRole("button", { name: "Void và tạo đơn thay thế" }).click();

    await expect(page.getByText(/Đang tạo đơn thay thế/)).toBeVisible();
    await expect(page.getByTestId("sale-line-0").getByLabel("Mặt hàng")).toHaveValue("Ớt hiểm");
    await expect(page.getByTestId("sale-line-0").getByLabel("Đơn giá")).toHaveValue("12000");

    // Replacement data comes from the voided Sale, not transient route state.
    // Reloading must recover the same editable draft intent.
    await page.reload();
    await expect(page.getByText(/Đang tạo đơn thay thế/)).toBeVisible();
    await expect(page.getByTestId("sale-line-0").getByLabel("Mặt hàng")).toHaveValue("Ớt hiểm");
    await expect(page.getByTestId("sale-line-0").getByLabel("Đơn giá")).toHaveValue("12000");

    await page.getByTestId("sale-line-0").getByLabel("Đơn giá").fill("13.000");
    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();
    await expect(page.getByTestId("posted-total")).toHaveText("130.000 ₫");
    await expect(page.getByText(/− Void: Nhập sai đơn giá/)).toBeVisible();

    const timeline = await api.timeline(customerId);
    expect(timeline.items.filter((entry) => entry.source.type === "sale_posting")).toHaveLength(2);
    expect(timeline.items.filter((entry) => entry.source.type === "sale_void")).toHaveLength(1);
    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(130_000);
  });

  test("a dropped void response is resent with the same command identity", async ({ page }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("S14"));
    await signIn(page, "owner");
    await page.goto(`/customers/${customerId}/sales/new`);

    await fillLine(page, 0, { product: "Rau muống", quantity: "10", price: "5.000" });
    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    let dropped = false;
    await page.route("**/trpc/sale.void**", async (route) => {
      if (!dropped) {
        dropped = true;
        await route.fetch().catch(() => undefined);
        await route.abort("connectionaborted");
        return;
      }
      await route.continue();
    });

    await page.getByRole("textbox", { name: /Lý do điều chỉnh/ }).fill("Ghi trùng đơn");
    await page.getByRole("button", { name: "Xác nhận void" }).click();
    await expect(page.getByText("Chưa rõ kết quả")).toBeVisible();
    await page.getByRole("button", { name: "Gửi lại" }).click();
    await expect(page.getByText(/− Void: Ghi trùng đơn/)).toBeVisible();

    const timeline = await api.timeline(customerId);
    expect(timeline.items.filter((entry) => entry.source.type === "sale_void")).toHaveLength(1);
    const balance = await api.balance(customerId);
    expect(balance.balance.amountMinor).toBe(0);
  });

  test("moves a wrong-customer replacement to the newly selected customer", async ({ page }) => {
    const wrongCustomerId = await api.createCustomer(uniqueCustomerName("S15-old"));
    const correctCustomerName = uniqueCustomerName("S15-new");
    const correctCustomerId = await api.createCustomer(correctCustomerName);
    await signIn(page, "owner");
    await page.goto(`/customers/${wrongCustomerId}/sales/new`);

    await fillLine(page, 0, { product: "Cà chua", quantity: "4", price: "20.000" });
    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    await page.getByRole("combobox", { name: "Loại điều chỉnh" }).selectOption("wrong_customer");
    await page.getByRole("checkbox", { name: /Tạo đơn thay thế sau khi void/ }).check();
    await page.getByRole("textbox", { name: "Khách hàng đúng" }).fill(correctCustomerName);
    await page.getByRole("button", { name: correctCustomerName }).click();
    await page.getByRole("textbox", { name: /Lý do điều chỉnh/ }).fill("Chọn nhầm khách");
    await page.getByRole("button", { name: "Void và tạo đơn thay thế" }).click();

    await expect(page).toHaveURL(new RegExp(`/customers/${correctCustomerId}/sales/new\\?`));
    await expect(page.getByText(correctCustomerName)).toBeVisible();
    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    expect((await api.balance(wrongCustomerId)).balance.amountMinor).toBe(0);
    expect((await api.balance(correctCustomerId)).balance.amountMinor).toBe(80_000);
  });

  test("recovers replacement navigation after reload between a committed void and its response", async ({
    page,
  }) => {
    const customerId = await api.createCustomer(uniqueCustomerName("S16"));
    await signIn(page, "owner");
    await page.goto(`/customers/${customerId}/sales/new`);
    await fillLine(page, 0, { product: "Rau muống", quantity: "2", price: "8.000" });
    await confirmPost(page);
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();

    await page.route("**/trpc/sale.void**", async (route) => {
      await route.fetch();
      await route.abort("connectionaborted");
    });
    await page.getByRole("checkbox", { name: /Tạo đơn thay thế sau khi void/ }).check();
    await page.getByRole("textbox", { name: /Lý do điều chỉnh/ }).fill("Nhập sai số lượng");
    await page.getByRole("button", { name: "Void và tạo đơn thay thế" }).click();
    await expect(page.getByText("Chưa rõ kết quả")).toBeVisible();

    await page.unroute("**/trpc/sale.void**");
    await page.reload();
    await expect(page.getByRole("heading", { name: /CHI TIẾT ĐƠN/ })).toBeVisible();
    await expect(page.getByText("Tiếp tục đơn thay thế")).toBeVisible();
    await page.getByRole("button", { name: "Tạo đơn thay thế" }).click();
    await expect(page.getByText(/Đang tạo đơn thay thế/)).toBeVisible();
  });
});
