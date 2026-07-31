import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CustomerPriceHistoryDto,
  ProductId,
  WorkspaceProductHistoryDto,
} from "@vuarau/domain-contracts";
import {
  POSTED_SALE_ID,
  PRODUCT_CA_CHUA_ID,
  PRODUCT_OT_ID,
  PRODUCT_RAU_MUONG_ID,
  SALE_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import { ProductPicker, type VisibleProduct } from "./product-picker.tsx";

const customerHistory: readonly CustomerPriceHistoryDto[] = [
  {
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    unit: "kg",
    lastUnitPrice: { amountMinor: 18_000, currency: "VND" },
    lastTransactionTime: "2026-07-15T08:00:00Z",
    sourceSaleId: SALE_ID,
  },
  {
    productId: PRODUCT_RAU_MUONG_ID,
    productName: "Rau muống",
    unit: "bo",
    lastUnitPrice: { amountMinor: 5_000, currency: "VND" },
    lastTransactionTime: "2026-07-10T08:00:00Z",
    sourceSaleId: POSTED_SALE_ID,
  },
];

const workspaceHistory: readonly WorkspaceProductHistoryDto[] = [
  {
    productId: PRODUCT_OT_ID,
    productName: "Ớt hiểm",
    unit: "thung",
    lastUnitPrice: null,
  },
];

const visibleProducts: readonly VisibleProduct[] = [
  { id: PRODUCT_CA_CHUA_ID, displayName: "Cà chua", preferredUnit: "kg" },
  { id: testUuid("d", 21) as ProductId, displayName: "Cà chua Đà Lạt", preferredUnit: "kg" },
  { id: PRODUCT_RAU_MUONG_ID, displayName: "Rau muống", preferredUnit: "bo" },
  { id: PRODUCT_OT_ID, displayName: "Ớt hiểm", preferredUnit: "thung" },
  { id: testUuid("d", 22) as ProductId, displayName: "Xà lách", preferredUnit: "kg" },
];

const onClose = vi.fn();
const onSelectProduct = vi.fn();
const onApplyHistoricalPrice = vi.fn();

function renderPicker(overrides: Partial<React.ComponentProps<typeof ProductPicker>> = {}) {
  return render(
    <ProductPicker
      open
      onClose={onClose}
      visibleProducts={visibleProducts}
      customerHistory={customerHistory}
      workspaceHistory={workspaceHistory}
      onSelectProduct={onSelectProduct}
      onApplyHistoricalPrice={onApplyHistoricalPrice}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductPicker", () => {
  it("matches Vietnamese names without requiring diacritics", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(screen.getByRole("searchbox", { name: "Tìm mặt hàng" }), "ot hiem");

    expect(screen.getByRole("button", { name: "Chọn Ớt hiểm · thùng" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chọn Cà chua · kg" })).not.toBeInTheDocument();
  });

  it("ranks exact catalog matches before prefix matches", async () => {
    const user = userEvent.setup();
    renderPicker({ customerHistory: [], workspaceHistory: [] });

    await user.type(screen.getByRole("searchbox", { name: "Tìm mặt hàng" }), "ca chua");

    const section = screen.getByRole("heading", { name: "Danh mục chung" }).closest("section");
    expect(section).not.toBeNull();
    const matches = within(section!).getAllByRole("button", { name: /Cà chua/ });
    expect(matches[0]).toHaveAccessibleName("Cà chua · kg");
    expect(matches[1]).toHaveAccessibleName("Cà chua Đà Lạt · kg");
  });

  it("keeps customer history ahead of workspace history and catalog", () => {
    renderPicker();

    const dialog = screen.getByRole("dialog", { name: "Chọn mặt hàng" });
    const sectionLabels = Array.from(dialog.querySelectorAll("section > h2")).map(
      (heading) => heading.textContent,
    );
    expect(sectionLabels).toEqual(["Gần đây với khách này", "Gần đây trong vựa", "Danh mục chung"]);
  });

  it("selects a historical product without silently applying its price", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Chọn Cà chua · kg" }));

    expect(onSelectProduct).toHaveBeenCalledWith(PRODUCT_CA_CHUA_ID, "Cà chua", "kg");
    expect(onApplyHistoricalPrice).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("applies a historical price only through the explicit price action", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Dùng giá lần trước cho Cà chua" }));

    expect(onApplyHistoricalPrice).toHaveBeenCalledWith(
      PRODUCT_CA_CHUA_ID,
      "Cà chua",
      "kg",
      SALE_ID,
      {
        amountMinor: 18_000,
        currency: "VND",
      },
    );
    expect(onSelectProduct).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("forwards drawer search text so the existing product.search query can refresh results", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPicker({ onSearchChange });

    const search = screen.getByRole("searchbox", { name: "Tìm mặt hàng" });
    await user.type(search, "ca");
    expect(onSearchChange).toHaveBeenLastCalledWith("ca");

    await user.click(screen.getByRole("button", { name: "Xoá tìm kiếm" }));
    expect(onSearchChange).toHaveBeenLastCalledWith("");
  });

  it("shows a useful empty state and can clear the search", async () => {
    const user = userEvent.setup();
    renderPicker();
    const search = screen.getByRole("searchbox", { name: "Tìm mặt hàng" });

    await user.type(search, "khong ton tai");
    expect(screen.getByText("Không tìm thấy mặt hàng")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xoá tìm kiếm" }));
    expect(search).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Gần đây với khách này" })).toBeInTheDocument();
  });
});
