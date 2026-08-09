import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickSaleFormModel } from "@/ui/controllers/quick-sale-form-model.ts";

vi.mock("next/dynamic", () => ({
  default: () =>
    function ProductPickerStub(props: {
      readonly open: boolean;
      readonly onClose: () => void;
      readonly onSelectProduct: (id: string, name: string, unit: string) => void;
      readonly onApplyHistoricalPrice: (
        id: string,
        name: string,
        unit: string,
        sourceSaleId: string,
        price: { readonly amountMinor: number; readonly currency: string },
      ) => void;
    }) {
      if (!props.open) return null;
      return (
        <div role="dialog" aria-label="Chọn mặt hàng">
          <button
            type="button"
            onClick={() => {
              props.onSelectProduct("product-two", "Rau muống", "bo");
              props.onClose();
            }}
          >
            Chọn sản phẩm cho dòng đang mở
          </button>
          <button
            type="button"
            onClick={() => {
              props.onApplyHistoricalPrice("product-two", "Rau muống", "bo", "sale-source", {
                amountMinor: 5_000,
                currency: "VND",
              });
              props.onClose();
            }}
          >
            Dùng giá lần trước cho dòng đang mở
          </button>
        </div>
      );
    },
}));

vi.mock("@/ui/patterns/feedback/query-states.tsx", () => ({
  QueryStates: (props: {
    readonly children: (value: {
      readonly customer: { readonly displayName: string };
      readonly balance: {
        readonly balance: { readonly amountMinor: number; readonly currency: string };
      };
      readonly classification: string;
      readonly customerHistory: readonly unknown[];
      readonly workspaceHistory: readonly unknown[];
    }) => ReactNode;
  }) =>
    props.children({
      customer: { displayName: "Khách thử" },
      balance: { balance: { amountMinor: 0, currency: "VND" } },
      classification: "settled",
      customerHistory: [],
      workspaceHistory: [],
    }),
}));

vi.mock("@/ui/patterns/sale/quick-sale-lines-section.tsx", () => ({
  QuickSaleLinesSection: (props: {
    readonly lines: readonly { readonly lineId: string }[];
    readonly onOpenProductPicker: (lineId: string) => void;
  }) => (
    <button type="button" onClick={() => props.onOpenProductPicker(props.lines[1]!.lineId)}>
      Mở picker dòng 2
    </button>
  ),
}));

vi.mock("@/ui/screens/quick-sale-view.tsx", () => ({
  QuickSaleView: (props: { readonly linesSection: ReactNode; readonly picker: ReactNode }) => (
    <>
      {props.linesSection}
      {props.picker}
    </>
  ),
}));

const lines = [
  {
    lineId: "line-one",
    productId: "product-one",
    productName: "Cà chua",
    qualityGradeId: "grade-one",
    qualityGradeName: "Loại 1",
    quantityText: "1",
    unit: "kg",
    unitPriceText: "18000",
    priceOrigin: null,
  },
  {
    lineId: "line-two",
    productId: "product-old",
    productName: "Ớt hiểm",
    qualityGradeId: "grade-one",
    qualityGradeName: "Loại 1",
    quantityText: "2",
    unit: "kg",
    unitPriceText: "250000",
    priceOrigin: null,
  },
] as const;

const readyQuery = {
  data: { customer: { displayName: "Khách thử" } },
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

function createModel(editLines: ReturnType<typeof vi.fn>): QuickSaleFormModel {
  return {
    activeLine: lines[0]!,
    activeLineId: lines[0]!.lineId,
    addLine: vi.fn(),
    cacheFetchedAt: null,
    cachedCatalogFetchedAt: null,
    cachedCustomer: null,
    capture: { ...readyQuery, data: { customerHistory: [], workspaceHistory: [] } },
    createActiveProduct: vi.fn(),
    customer: readyQuery,
    customerId: "customer-one" as QuickSaleFormModel["customerId"],
    dirty: false,
    discard: vi.fn(),
    draft: null,
    draftCommand: { phase: { kind: "idle" }, reset: vi.fn(), submit: vi.fn() } as never,
    editLines,
    evidence: "",
    lines,
    locallyQueued: false,
    fulfilmentReady: true,
    mayCreate: true,
    mayCreateProduct: false,
    mayPost: true,
    metrics: { count: vi.fn(), mark: vi.fn(), set: vi.fn() } as never,
    note: "",
    offline: { blockedCount: 0, commands: [] } as never,
    pendingCustomerCreate: null,
    post: vi.fn(),
    postCommand: { phase: { kind: "idle" }, submit: vi.fn(), reset: vi.fn() } as never,
    productCreateCommand: { phase: { kind: "idle" }, reset: vi.fn(), submit: vi.fn() } as never,
    priceResolution: undefined,
    applyResolvedPrice: vi.fn(),
    productSearchLoading: false,
    noProductMatch: false,
    operationalProfile: {
      isPending: false,
      isError: false,
      data: { qualityGradeMode: "required" },
    } as never,
    qualityGrades: { isPending: false, isError: false, data: { items: [] } } as never,
    qualityGradeOptions: [],
    qualityGradeRequired: true,
    replacementPending: false,
    replacementSource: readyQuery as never,
    replacesSaleId: null,
    resolved: lines.map(() => ({
      total: { amountMinor: 0, currency: "VND" },
      issues: {},
    })) as never,
    saveDraft: vi.fn(),
    serverLineIndex: null,
    session: { permissions: [], role: "owner" } as never,
    setActiveLineId: vi.fn(),
    setPickerProductQuery: vi.fn(),
    setDirty: vi.fn(),
    setEvidence: vi.fn(),
    setNote: vi.fn(),
    setUnitNotice: vi.fn(),
    submitted: false,
    total: { amountMinor: 0, currency: "VND" },
    unitNotice: null,
    visibleProducts: [],
  } as unknown as QuickSaleFormModel;
}

async function renderView() {
  const user = userEvent.setup();
  const editLines = vi.fn();
  const { QuickSaleFormView } = await import("./quick-sale-form-view.tsx");
  render(<QuickSaleFormView {...createModel(editLines)} />);
  await user.click(screen.getByRole("button", { name: "Mở picker dòng 2" }));
  return { editLines, user };
}

beforeEach(() => vi.clearAllMocks());

describe("QuickSaleFormView product picker target", () => {
  it("applies a selected product to the line that opened the picker", async () => {
    const { editLines, user } = await renderView();
    await user.click(screen.getByRole("button", { name: "Chọn sản phẩm cho dòng đang mở" }));

    const update = editLines.mock.calls[0]![0] as (current: typeof lines) => typeof lines;
    const next = update(lines);
    expect(next[0]).toEqual(lines[0]);
    expect(next[1]).toMatchObject({
      lineId: "line-two",
      productId: "product-two",
      productName: "Rau muống",
      unit: "bo",
    });
  });

  it("applies historical price to the line that opened the picker", async () => {
    const { editLines, user } = await renderView();
    await user.click(screen.getByRole("button", { name: "Dùng giá lần trước cho dòng đang mở" }));

    const update = editLines.mock.calls[0]![0] as (current: typeof lines) => typeof lines;
    const next = update(lines);
    expect(next[0]).toEqual(lines[0]);
    expect(next[1]).toMatchObject({
      lineId: "line-two",
      productId: "product-two",
      productName: "Rau muống",
      unit: "bo",
      unitPriceText: "5000",
      priceOrigin: { kind: "recalled", sourceSaleId: "sale-source" },
    });
  });
});
