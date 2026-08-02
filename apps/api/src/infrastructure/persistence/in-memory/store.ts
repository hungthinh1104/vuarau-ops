import type {
  ActorId,
  AuditRecordDto,
  CustomerAccountEntryDto,
  IsoInstant,
  WorkspaceId,
  Money,
  SupplierAccountEntryDto,
  DeliveryDto,
  DocumentDto,
  DocumentShareId,
  WorkspaceOperationalProfileDto,
  CashAccountDto,
  CashBalanceDto,
  CashMovementDto,
  CashTransferDto,
  ExpenseDto,
  GoodsArrivalDto,
  QualityDispositionDto,
  QualityInspectionDto,
  QualityIssueCodeDto,
} from "@vuarau/domain-contracts";
import type { PaymentReversalState, SaleVoidState } from "@vuarau/domain-kernel";
import type { IdGenerator } from "../../clock.ts";
import type { CommandReceipt, WorkspaceMembership } from "../ports.ts";
import type {
  CustomerAccountBalance,
  CustomerState,
  SaleState,
  PaymentState,
  PriceRuleState,
  ProductState,
  QualityGradeState,
  SupplierState,
  SupplierPaymentState,
  PurchaseState,
  PurchaseVoidState,
  PurchaseReceiptState,
  InventoryMovementState,
  DeliveryState,
  DeliveryReturnState,
} from "@vuarau/domain-kernel";

export type Store = {
  memberships: Map<string, WorkspaceMembership & { readonly createdAt: IsoInstant }>;
  /** Workspace id → display name, which is all a picker needs (BR-AUTH-008). */
  workspaceNames: Map<string, string>;
  operationalProfiles: Map<string, WorkspaceOperationalProfileDto>;
  /** Supabase subject → local actor id (BR-AUTH-005). */
  actorsBySubject: Map<string, ActorId>;
  /** Actor display names, for the audit timeline's `actorDisplayName`. */
  actorNames: Map<string, string>;
  customers: Map<string, CustomerState>;
  products: Map<string, ProductState>;
  priceRules: Map<string, PriceRuleState>;
  qualityGrades: Map<string, QualityGradeState>;
  suppliers: Map<string, SupplierState>;
  supplierPayments: Map<string, SupplierPaymentState>;
  supplierPaymentReversals: Array<{
    id: string;
    workspaceId: WorkspaceId;
    supplierPaymentId: SupplierPaymentState["id"];
    amount: Money;
    reason: string;
    transactionTime: IsoInstant;
    recordedAt: IsoInstant;
  }>;
  supplierAccountEntries: SupplierAccountEntryDto[];
  supplierAccountBalances: Map<
    string,
    {
      workspaceId: WorkspaceId;
      supplierId: SupplierState["id"];
      balance: Money;
      entryCount: number;
      lastEntryTransactionTime: IsoInstant | null;
      updatedAt: IsoInstant;
    }
  >;
  purchases: Map<string, PurchaseState>;
  purchaseVoids: PurchaseVoidState[];
  purchaseReceipts: Map<string, PurchaseReceiptState>;
  inventoryMovements: InventoryMovementState[];
  inventoryBalances: Map<
    string,
    {
      workspaceId: WorkspaceId;
      productId: InventoryMovementState["productId"];
      qualityGradeId: InventoryMovementState["qualityGradeId"];
      unit: InventoryMovementState["quantity"]["unit"];
      quantityScaled: number;
      movementCount: number;
      lastMovementTransactionTime: IsoInstant | null;
      updatedAt: IsoInstant;
    }
  >;
  deliveries: Map<string, DeliveryState>;
  deliveryReturns: DeliveryReturnState[];
  documents: Map<string, DocumentDto>;
  documentShares: Map<
    string,
    {
      id: DocumentShareId;
      workspaceId: WorkspaceId;
      documentId: DocumentDto["id"];
      tokenHash: string;
      expiresAt: IsoInstant | null;
      createdAt: IsoInstant;
      createdBy: ActorId;
      revokedAt: IsoInstant | null;
      revokedBy: ActorId | null;
      revokeReason: string | null;
    }
  >;
  sales: Map<string, SaleState>;
  payments: Map<string, PaymentState>;
  reversals: PaymentReversalState[];
  saleVoids: SaleVoidState[];
  accountEntries: CustomerAccountEntryDto[];
  balances: Map<string, CustomerAccountBalance>;
  audit: AuditRecordDto[];
  receipts: Map<string, CommandReceipt>;
  cashAccounts: Map<string, CashAccountDto>;
  expenses: Map<string, ExpenseDto>;
  cashTransfers: Map<string, CashTransferDto>;
  cashAdjustments: Array<{
    id: string;
    workspaceId: WorkspaceId;
    cashAccountId: CashAccountDto["id"];
    amount: Money;
    reasonCode: string;
    reason: string;
    transactionTime: IsoInstant;
    recordedAt: IsoInstant;
    actorId: ActorId;
    commandId: string;
  }>;
  cashMovements: CashMovementDto[];
  cashBalances: Map<string, CashBalanceDto>;
  qualityIssueCodes: Map<string, QualityIssueCodeDto>;
  goodsArrivals: Map<string, GoodsArrivalDto>;
  qualityInspections: Map<string, QualityInspectionDto>;
  qualityDispositions: Map<string, QualityDispositionDto>;
};

export function emptyStore(): Store {
  return {
    memberships: new Map(),
    workspaceNames: new Map(),
    operationalProfiles: new Map(),
    actorsBySubject: new Map(),
    actorNames: new Map(),
    customers: new Map(),
    products: new Map(),
    priceRules: new Map(),
    qualityGrades: new Map(),
    suppliers: new Map(),
    supplierPayments: new Map(),
    supplierPaymentReversals: [],
    supplierAccountEntries: [],
    supplierAccountBalances: new Map(),
    purchases: new Map(),
    purchaseVoids: [],
    purchaseReceipts: new Map(),
    inventoryMovements: [],
    inventoryBalances: new Map(),
    deliveries: new Map(),
    deliveryReturns: [],
    documents: new Map(),
    documentShares: new Map(),
    sales: new Map(),
    payments: new Map(),
    reversals: [],
    saleVoids: [],
    accountEntries: [],
    balances: new Map(),
    audit: [],
    receipts: new Map(),
    cashAccounts: new Map(),
    expenses: new Map(),
    cashTransfers: new Map(),
    cashAdjustments: [],
    cashMovements: [],
    cashBalances: new Map(),
    qualityIssueCodes: new Map(),
    goodsArrivals: new Map(),
    qualityInspections: new Map(),
    qualityDispositions: new Map(),
  };
}

export const key = (workspaceId: string, id: string) => `${workspaceId}:${id}`;

export const ascendingBy =
  <T>(sortValue: (row: T) => string, id: (row: T) => string) =>
  (a: T, b: T): number =>
    sortValue(a) === sortValue(b)
      ? id(a).localeCompare(id(b))
      : sortValue(a).localeCompare(sortValue(b));

export const descendingBy =
  <T>(sortValue: (row: T) => string, id: (row: T) => string) =>
  (a: T, b: T): number =>
    -ascendingBy(sortValue, id)(a, b);

export const after = (row: [string, string], cursor: [string, string]): boolean =>
  row[0] === cursor[0] ? row[1] > cursor[1] : row[0] > cursor[0];

export const before = (row: [string, string], cursor: [string, string]): boolean =>
  row[0] === cursor[0] ? row[1] < cursor[1] : row[0] < cursor[0];

export function takePage<TRow>(
  rows: readonly TRow[],
  page: { limit: number },
  cursorOf: (row: TRow) => { sortValue: string; id: string },
): { rows: readonly TRow[]; next: { sortValue: string; id: string } | null } {
  if (rows.length <= page.limit) {
    return { rows, next: null };
  }
  const visible = rows.slice(0, page.limit);
  return { rows: visible, next: cursorOf(visible[visible.length - 1]!) };
}

export const FOLD_FROM =
  "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ" +
  "àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵýỷỹ";

export const FOLD_TO =
  "AAAAEEEIIOOOOUUADIUOUAAAAAAAAAAAAEEEEEEEEIIOOOOOOOOOOOOUUUUUUUYYYYY" +
  "aaaaeeeiioooouuadiuouaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyy";

export function fold(text: string): string {
  let folded = "";
  for (const character of text) {
    const index = FOLD_FROM.indexOf(character);
    folded += index === -1 ? character : FOLD_TO[index];
  }
  return folded.toLowerCase();
}

export function toPaymentSummaryRow(store: Store, payment: PaymentState) {
  return {
    id: payment.id,
    workspaceId: payment.workspaceId,
    customerId: payment.customerId,
    customerDisplayName:
      store.customers.get(key(payment.workspaceId, payment.customerId))?.displayName ?? "",
    amount: payment.amount,
    method: payment.method,
    cashAccountId: payment.cashAccountId ?? null,
    status: payment.status,
    reversedAmount: payment.reversedAmount,
    payerName: payment.payerName,
    note: payment.note,
    version: payment.version,
    transactionTime: payment.transactionTime,
    recordedAt: payment.recordedAt,
  };
}

export function toPurchaseDto(purchase: PurchaseState) {
  return {
    ...purchase,
    lines: purchase.lines.map((line) => ({ ...line })),
    voidRecord:
      purchase.voidRecord === null
        ? null
        : {
            id: purchase.voidRecord.id,
            purchaseId: purchase.voidRecord.purchaseId,
            reasonCode: purchase.voidRecord.reasonCode,
            reason: purchase.voidRecord.reason,
            amount: purchase.voidRecord.amount,
            transactionTime: purchase.voidRecord.transactionTime,
            recordedAt: purchase.voidRecord.recordedAt,
          },
  };
}

export function toDeliveryDto(delivery: DeliveryState): DeliveryDto {
  return {
    id: delivery.id,
    workspaceId: delivery.workspaceId,
    saleId: delivery.saleId,
    status: delivery.status,
    lines: delivery.lines.map((line) => ({
      deliveryLineId: line.deliveryLineId,
      saleLineId: line.saleLineId,
      productId: line.productId,
      productName: line.productName,
      qualityGradeId: line.qualityGradeId,
      qualityGradeName: line.qualityGradeName,
      quantity: line.quantity,
      returnedQuantity: {
        valueScaled: delivery.returns
          .flatMap((record) => record.lines)
          .filter((candidate) => candidate.deliveryLineId === line.deliveryLineId)
          .reduce((sum, candidate) => sum + candidate.quantity.valueScaled, 0),
        unit: line.quantity.unit,
      },
    })),
    note: delivery.note,
    cancellationReason: delivery.cancellationReason,
    version: delivery.version,
    transactionTime: delivery.transactionTime,
    recordedAt: delivery.recordedAt,
    dispatchedAt: delivery.dispatchedAt,
    deliveredAt: delivery.deliveredAt,
    returns: delivery.returns.map((record) => ({
      id: record.id,
      reason: record.reason,
      lines: record.lines.map((line) => ({
        deliveryLineId: line.deliveryLineId,
        quantity: line.quantity,
      })),
      transactionTime: record.transactionTime,
      recordedAt: record.recordedAt,
      actorId: record.actorId,
    })),
  };
}

export function sourceDocument(
  store: Store,
  sourceType: CustomerAccountEntryDto["sourceType"],
  sourceId: string,
): { type: "sale" | "payment" | "adjustment"; id: string } {
  if (sourceType === "sale_posting") return { type: "sale", id: sourceId };
  if (sourceType === "sale_void") {
    return {
      type: "sale",
      id: store.saleVoids.find((record) => record.id === sourceId)?.saleId ?? sourceId,
    };
  }
  if (sourceType === "payment") return { type: "payment", id: sourceId };
  if (sourceType === "payment_reversal") {
    return {
      type: "payment",
      id: store.reversals.find((record) => record.id === sourceId)?.paymentId ?? sourceId,
    };
  }
  return { type: "adjustment", id: sourceId };
}

export function sequentialIdGenerator(prefix = "9"): IdGenerator {
  let counter = 0;
  return {
    newId: () => {
      counter += 1;
      const suffix = `${prefix}${String(counter).padStart(2, "0")}`.padStart(12, "0");
      return `00000000-0000-4000-8000-${suffix}`;
    },
  };
}
