import { render, screen, within } from "@testing-library/react";
import type { Page, ProductCoverageDto, ProductDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { PRODUCT_CA_CHUA_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { ProductsDirectoryView } from "./products-directory-view.tsx";

const product: ProductDto = {
  id: PRODUCT_CA_CHUA_ID,
  workspaceId: WORKSPACE_ID,
  displayName: "Cà chua",
  aliases: ["cà chua đỏ"],
  preferredUnit: "kg",
  isActive: true,
  version: 1,
  createdAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

const coverage: ProductCoverageDto = {
  workspaceId: WORKSPACE_ID,
  productId: PRODUCT_CA_CHUA_ID,
  quantities: [
    {
      unit: "kg",
      onHand: { valueScaled: 4_000, unit: "kg" },
      inboundRemaining: { valueScaled: 6_000, unit: "kg" },
      outboundRemaining: { valueScaled: 12_000, unit: "kg" },
      availableAfterCommitments: { valueScaled: -2_000, unit: "kg" },
      classification: "shortage",
    },
  ],
};

const ready = <T,>(data: T) => ({ isPending: false, isError: false, error: null, data });

describe("ProductsDirectoryView", () => {
  it("prioritizes operational stock coverage over catalogue metadata", () => {
    render(
      <ProductsDirectoryView
        queryText=""
        onQueryChange={() => undefined}
        onClearQuery={() => undefined}
        activeFilter={null}
        onFilterChange={() => undefined}
        search={ready({ items: [product], nextCursor: null } satisfies Page<ProductDto>)}
        coverageQuery={ready([coverage])}
        products={[product]}
        coverage={[coverage]}
        nextCursor={null}
        isFetching={false}
        onRetry={() => undefined}
        onRetryCoverage={() => undefined}
        onLoadMore={() => undefined}
        canCreate
      />,
    );

    expect(screen.getByRole("heading", { name: "Hàng hóa & kho" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Tồn thực tế" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Đang mua" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Cần giao" })).toBeInTheDocument();
    expect(within(table).getByText("Thiếu 2 kg")).toBeInTheDocument();
    expect(within(table).getByText("Cần bù hàng")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Cà chua" })
        .some((link) => link.getAttribute("href") === `/products/${PRODUCT_CA_CHUA_ID}/inventory`),
    ).toBe(true);
  });
});
