import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { customerWithCredit } from "@/fixtures/customer.fixtures.ts";
import type { Page, PriceRuleDto, ProductDto, QualityGradeDto } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { PricingView } from "./pricing-view.tsx";

const command: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

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

const grade: QualityGradeDto = {
  id: QUALITY_GRADE_1_ID,
  workspaceId: WORKSPACE_ID,
  name: "Loại 1",
  sortOrder: 1,
  isActive: true,
  version: 1,
  createdAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

const rule: PriceRuleDto = {
  id: "00000000-0000-4000-8000-000000000901" as PriceRuleDto["id"],
  workspaceId: WORKSPACE_ID,
  productId: PRODUCT_CA_CHUA_ID,
  qualityGradeId: QUALITY_GRADE_1_ID,
  customerId: CUSTOMER_ID,
  unit: "kg",
  kind: "customer",
  priority: 10,
  minimumQuantityScaled: 1_000,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveTo: null,
  baseUnitPrice: { amountMinor: 100_000, currency: "VND" },
  discountPerUnit: { amountMinor: 2_000, currency: "VND" },
  feePerUnit: { amountMinor: 500, currency: "VND" },
  finalUnitPrice: { amountMinor: 98_500, currency: "VND" },
  reason: "Giá khách sỉ đã chốt",
  actorId: ACTOR_ID,
  commandId: "00000000-0000-4000-8000-000000000902" as PriceRuleDto["commandId"],
  recordedAt: RECORDED_AT,
};

const page: Page<PriceRuleDto> = { items: [rule], nextCursor: null };
const ready = { isPending: false, isError: false, error: null, data: page } as const;

const meta = {
  title: "Screens/Pricing",
  component: PricingView,
  args: {
    rules: ready,
    items: [rule],
    nextCursor: null,
    isFetching: false,
    products: [product],
    customers: [customerWithCredit],
    grades: [grade],
    mayManage: true,
    productSearch: "",
    customerSearch: "",
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: QUALITY_GRADE_1_ID,
    customerId: CUSTOMER_ID,
    kind: "customer" as const,
    unit: "kg" as const,
    priority: "10",
    minimumQuantity: "1",
    effectiveFrom: "2026-01-01T00:00",
    effectiveTo: "",
    basePrice: "100000",
    discount: "2000",
    fee: "500",
    reason: "Giá khách sỉ đã chốt",
    formError: null,
    command,
    onProductSearch: () => undefined,
    onCustomerSearch: () => undefined,
    onProductId: () => undefined,
    onQualityGradeId: () => undefined,
    onCustomerId: () => undefined,
    onKind: () => undefined,
    onUnit: () => undefined,
    onPriority: () => undefined,
    onMinimumQuantity: () => undefined,
    onEffectiveFrom: () => undefined,
    onEffectiveTo: () => undefined,
    onBasePrice: () => undefined,
    onDiscount: () => undefined,
    onFee: () => undefined,
    onReason: () => undefined,
    onSubmit: () => undefined,
    onRetry: () => undefined,
    onLoadMore: () => undefined,
    onReload: async () => undefined,
  },
} satisfies Meta<typeof PricingView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Manage: Story = { globals: { viewport: { value: "desktop" } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile" } } };
export const ReadOnly: Story = { args: { mayManage: false } };
export const Empty: Story = {
  args: {
    items: [],
    rules: { ...ready, data: { items: [], nextCursor: null } },
  },
};
export const NetworkFailure: Story = {
  args: {
    items: [],
    rules: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
