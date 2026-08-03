import type { Repositories } from "../../ports.ts";
import type {
  ActorId,
  AuditRecordDto,
  CustomerAccountEntryDto,
  IsoInstant,
  WorkspaceId,
  SupplierAccountEntryDto,
  DocumentDto,
  DocumentShareId,
  WorkspaceOperationalProfileDto,
  CashAccountDto,
  CashMovementDto,
  CashTransferDto,
  ExpenseDto,
  GoodsArrivalDto,
  QualityDispositionDto,
  QualityInspectionDto,
  QualityIssueCodeDto,
  CostObservationDto,
  ReconciliationObservationDto,
} from "@vuarau/domain-contracts";
import type { PaymentReversalState, SaleVoidState } from "@vuarau/domain-kernel";
import { money } from "@vuarau/domain-kernel";
import type { CommandReceipt } from "../../ports.ts";
import type {
  CustomerState,
  PriceRuleState,
  SaleState,
  PaymentState,
  ProductState,
  SupplierState,
  SupplierPaymentState,
  PurchaseState,
  PurchaseVoidState,
  PurchaseReceiptState,
  InventoryMovementState,
  QualityGradeState,
  DeliveryState,
  DeliveryReturnState,
} from "@vuarau/domain-kernel";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createOperationsRepositories = (store: Store): Pick<Repositories, "operations"> => ({
  operations: {
    restoreBackup: async (workspaceId, payload) => {
      const occupied =
        [
          ...store.cashAccounts.values(),
          ...store.customers.values(),
          ...store.products.values(),
          ...store.priceRules.values(),
          ...store.qualityGrades.values(),
          ...store.qualityIssueCodes.values(),
          ...store.goodsArrivals.values(),
          ...store.qualityInspections.values(),
          ...store.qualityDispositions.values(),
          ...store.costObservations.values(),
          ...store.reconciliationObservations.values(),
          ...store.sales.values(),
          ...store.suppliers.values(),
          ...store.purchases.values(),
          ...store.deliveries.values(),
          ...store.documents.values(),
        ].some((row) => row.workspaceId === workspaceId) ||
        store.accountEntries.some((row) => row.workspaceId === workspaceId) ||
        store.inventoryMovements.some((row) => row.workspaceId === workspaceId) ||
        store.cashMovements.some((row) => row.workspaceId === workspaceId);
      if (occupied) {
        return { kind: "unsafe_target" as const, reason: "target contains business data" };
      }
      try {
        const remap = <T extends Record<string, unknown>>(row: T) => ({
          ...row,
          workspaceId,
        });
        store.operationalProfiles.set(
          workspaceId,
          remap(payload.operationalProfile) as unknown as WorkspaceOperationalProfileDto,
        );
        for (const raw of payload.costObservations) {
          const row = remap(raw) as unknown as CostObservationDto;
          store.costObservations.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.reconciliationObservations) {
          const row = remap(raw) as unknown as ReconciliationObservationDto;
          store.reconciliationObservations.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.cashAccounts) {
          const row = remap(raw) as unknown as CashAccountDto;
          store.cashAccounts.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.expenses) {
          const reversal = payload.expenseReversals.find(
            (candidate) => candidate["expenseId"] === raw["id"],
          );
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
            reversal:
              reversal === undefined
                ? null
                : {
                    id: reversal["id"],
                    reason: reversal["reason"],
                    transactionTime: reversal["transactionTime"],
                    recordedAt: reversal["recordedAt"],
                    actorId: reversal["actorId"],
                    commandId: reversal["commandId"],
                    evidenceReferences: reversal["evidenceReferences"] ?? [],
                  },
          }) as unknown as ExpenseDto;
          store.expenses.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.cashTransfers) {
          const reversal = payload.cashTransferReversals.find(
            (candidate) => candidate["transferId"] === raw["id"],
          );
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
            reversal:
              reversal === undefined
                ? null
                : {
                    id: reversal["id"],
                    reason: reversal["reason"],
                    transactionTime: reversal["transactionTime"],
                    recordedAt: reversal["recordedAt"],
                    actorId: reversal["actorId"],
                    commandId: reversal["commandId"],
                    evidenceReferences: reversal["evidenceReferences"] ?? [],
                  },
          }) as unknown as CashTransferDto;
          store.cashTransfers.set(key(workspaceId, row.id), row);
        }
        store.cashAdjustments.push(
          ...payload.cashAdjustments.map(
            (raw) =>
              remap({
                ...raw,
                evidenceReferences: raw["evidenceReferences"] ?? [],
              }) as unknown as Store["cashAdjustments"][number],
          ),
        );
        store.cashMovements.push(
          ...payload.cashMovements.map((raw) => remap(raw) as unknown as CashMovementDto),
        );
        for (const raw of payload.customers) {
          const row = remap(raw) as unknown as CustomerState;
          store.customers.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.products) {
          const row = remap(raw) as unknown as ProductState;
          store.products.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.priceRules) {
          const row = remap(raw) as unknown as PriceRuleState;
          store.priceRules.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.qualityGrades) {
          const row = remap(raw) as unknown as QualityGradeState;
          store.qualityGrades.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.qualityIssueCodes) {
          const row = remap(raw) as unknown as QualityIssueCodeDto;
          store.qualityIssueCodes.set(key(workspaceId, row.id), row);
        }
        const arrivalLines = new Map<string, GoodsArrivalDto["lines"]>();
        for (const raw of payload.goodsArrivalLines) {
          const arrivalId = String(raw["arrivalId"]);
          const weightUnit = raw["weightUnit"];
          const line = {
            arrivalLineId: raw["id"],
            purchaseLineId: raw["purchaseLineId"] ?? null,
            productId: raw["productId"],
            productName: raw["productName"],
            arrivedQuantity: {
              valueScaled: Number(raw["arrivedValueScaled"]),
              unit: raw["arrivedUnit"],
            },
            weighing:
              raw["grossWeightValueScaled"] == null ||
              raw["tareWeightValueScaled"] == null ||
              raw["netWeightValueScaled"] == null ||
              weightUnit == null
                ? null
                : {
                    containerCount:
                      raw["containerCount"] == null ? null : Number(raw["containerCount"]),
                    grossWeight: {
                      valueScaled: Number(raw["grossWeightValueScaled"]),
                      unit: weightUnit,
                    },
                    tareWeight: {
                      valueScaled: Number(raw["tareWeightValueScaled"]),
                      unit: weightUnit,
                    },
                    netWeight: {
                      valueScaled: Number(raw["netWeightValueScaled"]),
                      unit: weightUnit,
                    },
                  },
            supplierLotCode: raw["supplierLotCode"] ?? null,
            note: raw["note"] ?? null,
          } as unknown as GoodsArrivalDto["lines"][number];
          arrivalLines.set(arrivalId, [...(arrivalLines.get(arrivalId) ?? []), line]);
        }
        const arrivalReversals = new Map<string, GoodsArrivalDto["reversal"]>();
        for (const raw of payload.goodsArrivalReversals) {
          arrivalReversals.set(String(raw["arrivalId"]), {
            id: raw["id"],
            reason: raw["reason"],
            transactionTime: raw["transactionTime"],
            recordedAt: raw["recordedAt"],
            actorId: raw["actorId"],
            commandId: raw["commandId"],
            evidenceReferences: raw["evidenceReferences"] ?? [],
          } as unknown as NonNullable<GoodsArrivalDto["reversal"]>);
        }
        for (const raw of payload.goodsArrivals) {
          const id = String(raw["id"]);
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
            lines: arrivalLines.get(id) ?? [],
            reversal: arrivalReversals.get(id) ?? null,
          }) as unknown as GoodsArrivalDto;
          store.goodsArrivals.set(key(workspaceId, row.id), row);
        }
        const inspectionIssues = new Map<string, QualityInspectionDto["issues"]>();
        for (const raw of payload.qualityInspectionIssues) {
          const inspectionId = String(raw["inspectionId"]);
          const issue = {
            qualityIssueCodeId: raw["qualityIssueCodeId"],
            qualityIssueCode: raw["qualityIssueCode"],
            qualityIssueName: raw["qualityIssueName"],
            severity: raw["severity"],
            note: raw["note"] ?? null,
          } as unknown as QualityInspectionDto["issues"][number];
          inspectionIssues.set(inspectionId, [
            ...(inspectionIssues.get(inspectionId) ?? []),
            issue,
          ]);
        }
        const inspectionReversals = new Map<string, QualityInspectionDto["reversal"]>();
        for (const raw of payload.qualityInspectionReversals) {
          inspectionReversals.set(String(raw["inspectionId"]), {
            id: raw["id"],
            reason: raw["reason"],
            transactionTime: raw["transactionTime"],
            recordedAt: raw["recordedAt"],
            actorId: raw["actorId"],
            commandId: raw["commandId"],
          } as unknown as NonNullable<QualityInspectionDto["reversal"]>);
        }
        for (const raw of payload.qualityInspections) {
          const id = String(raw["id"]);
          const row = remap({
            ...raw,
            inspectedQuantity: {
              valueScaled: Number(raw["inspectedValueScaled"]),
              unit: raw["inspectedUnit"],
            },
            issues: inspectionIssues.get(id) ?? [],
            reversal: inspectionReversals.get(id) ?? null,
          }) as unknown as QualityInspectionDto;
          store.qualityInspections.set(key(workspaceId, row.id), row);
        }
        const dispositionAllocations = new Map<string, QualityDispositionDto["allocations"]>();
        for (const raw of payload.qualityDispositionAllocations) {
          const dispositionId = String(raw["dispositionId"]);
          const allocation = {
            allocationId: raw["id"],
            outcome: raw["outcome"],
            quantity: {
              valueScaled: Number(raw["valueScaled"]),
              unit: raw["unit"],
            },
            qualityGradeId: raw["qualityGradeId"] ?? null,
            qualityGradeName: raw["qualityGradeName"] ?? null,
            note: raw["note"] ?? null,
          } as unknown as QualityDispositionDto["allocations"][number];
          dispositionAllocations.set(dispositionId, [
            ...(dispositionAllocations.get(dispositionId) ?? []),
            allocation,
          ]);
        }
        const dispositionReversals = new Map<string, QualityDispositionDto["reversal"]>();
        for (const raw of payload.qualityDispositionReversals) {
          dispositionReversals.set(String(raw["dispositionId"]), {
            id: raw["id"],
            reason: raw["reason"],
            transactionTime: raw["transactionTime"],
            recordedAt: raw["recordedAt"],
            actorId: raw["actorId"],
            commandId: raw["commandId"],
            evidenceReferences: raw["evidenceReferences"] ?? [],
          } as unknown as NonNullable<QualityDispositionDto["reversal"]>);
        }
        for (const raw of payload.qualityDispositions) {
          const id = String(raw["id"]);
          const source =
            raw["sourceType"] === "arrival_line"
              ? { type: "arrival_line", arrivalLineId: raw["sourceArrivalLineId"] }
              : {
                  type: "quarantine_allocation",
                  allocationId: raw["sourceQuarantineAllocationId"],
                };
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
            source,
            allocations: dispositionAllocations.get(id) ?? [],
            reversal: dispositionReversals.get(id) ?? null,
          }) as unknown as QualityDispositionDto;
          store.qualityDispositions.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.sales) {
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
          }) as unknown as SaleState;
          store.sales.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.saleVoids) {
          store.saleVoids.push(
            remap({
              ...raw,
              evidenceReferences: raw["evidenceReferences"] ?? [],
            }) as unknown as SaleVoidState,
          );
        }
        for (const raw of payload.payments) {
          const row = remap({
            ...raw,
            // V8 backups created before source evidence was added remain restorable.
            evidenceReferences: raw["evidenceReferences"] ?? [],
          }) as unknown as PaymentState;
          store.payments.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.paymentReversals) {
          store.reversals.push(
            remap({
              ...raw,
              evidenceReferences: raw["evidenceReferences"] ?? [],
            }) as unknown as PaymentReversalState,
          );
        }
        for (const raw of payload.accountEntries) {
          store.accountEntries.push(remap(raw) as unknown as CustomerAccountEntryDto);
        }
        for (const raw of payload.audit) {
          store.audit.push(remap(raw) as unknown as AuditRecordDto);
        }
        for (const raw of payload.commandReceipts) {
          const row = remap(raw) as unknown as CommandReceipt;
          store.receipts.set(key(workspaceId, row.idempotencyKey), row);
        }
        for (const raw of payload.suppliers) {
          const row = remap(raw) as unknown as SupplierState;
          store.suppliers.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.supplierPayments) {
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
          }) as unknown as SupplierPaymentState;
          store.supplierPayments.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.supplierPaymentReversals) {
          store.supplierPaymentReversals.push(
            remap({
              ...raw,
              evidenceReferences: raw["evidenceReferences"] ?? [],
            }) as unknown as Store["supplierPaymentReversals"][number],
          );
        }
        for (const raw of payload.supplierAccountEntries) {
          store.supplierAccountEntries.push(remap(raw) as unknown as SupplierAccountEntryDto);
        }
        for (const raw of payload.purchases) {
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
          }) as unknown as PurchaseState;
          store.purchases.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.purchaseVoids) {
          store.purchaseVoids.push(
            remap({
              ...raw,
              evidenceReferences: raw["evidenceReferences"] ?? [],
            }) as unknown as PurchaseVoidState,
          );
        }
        for (const raw of payload.receipts) {
          const reversal = payload.receiptReversals.find(
            (candidate) => candidate["receiptId"] === raw["id"],
          );
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
            reversal:
              reversal === undefined
                ? null
                : {
                    id: reversal["id"],
                    workspaceId,
                    receiptId: reversal["receiptId"],
                    reasonCode: reversal["reasonCode"],
                    reason: reversal["reason"],
                    transactionTime: reversal["transactionTime"],
                    recordedAt: reversal["recordedAt"],
                    actorId: reversal["actorId"],
                    evidenceReferences: reversal["evidenceReferences"] ?? [],
                  },
          }) as unknown as PurchaseReceiptState;
          store.purchaseReceipts.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.inventoryMovements) {
          store.inventoryMovements.push(remap(raw) as unknown as InventoryMovementState);
        }
        for (const raw of payload.deliveries) {
          const row = remap({
            ...raw,
            evidenceReferences: raw["evidenceReferences"] ?? [],
          }) as unknown as DeliveryState;
          store.deliveries.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.deliveryReturns)
          store.deliveryReturns.push(
            remap({
              ...raw,
              evidenceReferences: raw["evidenceReferences"] ?? [],
            }) as unknown as DeliveryReturnState,
          );
        for (const raw of payload.documents) {
          const row = remap(raw) as unknown as DocumentDto;
          store.documents.set(key(workspaceId, row.id), row);
        }
        for (const raw of payload.documentShares) {
          const row = remap(raw) as unknown as {
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
          };
          store.documentShares.set(key(workspaceId, row.id), row);
        }
        for (const customer of [...store.customers.values()].filter(
          (row) => row.workspaceId === workspaceId,
        )) {
          const entries = store.accountEntries.filter(
            (entry) => entry.workspaceId === workspaceId && entry.customerId === customer.id,
          );
          const balance = money(
            entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0),
            "VND",
          );
          store.balances.set(key(workspaceId, customer.id), {
            workspaceId,
            customerId: customer.id,
            balance,
            entryCount: entries.length,
            lastEntryTransactionTime:
              entries
                .map((entry) => entry.transactionTime)
                .sort()
                .at(-1) ?? null,
            updatedAt: new Date().toISOString() as IsoInstant,
          });
        }
        for (const supplier of [...store.suppliers.values()].filter(
          (row) => row.workspaceId === workspaceId,
        )) {
          const entries = store.supplierAccountEntries.filter(
            (entry) => entry.workspaceId === workspaceId && entry.supplierId === supplier.id,
          );
          store.supplierAccountBalances.set(key(workspaceId, supplier.id), {
            workspaceId,
            supplierId: supplier.id,
            balance: money(
              entries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0),
              "VND",
            ),
            entryCount: entries.length,
            lastEntryTransactionTime:
              entries
                .map((entry) => entry.transactionTime)
                .sort()
                .at(-1) ?? null,
            updatedAt: new Date().toISOString() as IsoInstant,
          });
        }
        const inventoryKeys = new Set(
          store.inventoryMovements
            .filter((movement) => movement.workspaceId === workspaceId)
            .map(
              (movement) =>
                `${movement.productId}:${movement.qualityGradeId ?? "legacy"}:${movement.quantity.unit}`,
            ),
        );
        for (const inventoryKey of inventoryKeys) {
          const [productId, qualityGradeId, unit] = inventoryKey.split(":");
          const movements = store.inventoryMovements.filter(
            (movement) =>
              movement.workspaceId === workspaceId &&
              movement.productId === productId &&
              (movement.qualityGradeId ?? "legacy") === qualityGradeId &&
              movement.quantity.unit === unit,
          );
          store.inventoryBalances.set(`${workspaceId}:${inventoryKey}`, {
            workspaceId,
            productId: productId as InventoryMovementState["productId"],
            qualityGradeId:
              qualityGradeId === "legacy"
                ? null
                : (qualityGradeId as InventoryMovementState["qualityGradeId"]),
            unit: unit as InventoryMovementState["quantity"]["unit"],
            quantityScaled: movements.reduce(
              (sum, movement) => sum + movement.quantity.valueScaled,
              0,
            ),
            movementCount: movements.length,
            lastMovementTransactionTime:
              movements
                .map((movement) => movement.transactionTime)
                .sort()
                .at(-1) ?? null,
            updatedAt: new Date().toISOString() as IsoInstant,
          });
        }
        for (const account of [...store.cashAccounts.values()].filter(
          (row) => row.workspaceId === workspaceId,
        )) {
          const movements = store.cashMovements.filter(
            (movement) =>
              movement.workspaceId === workspaceId && movement.cashAccountId === account.id,
          );
          store.cashBalances.set(key(workspaceId, account.id), {
            workspaceId,
            cashAccountId: account.id,
            balance: {
              amountMinor: movements.reduce(
                (sum, movement) => sum + movement.amount.amountMinor,
                0,
              ),
              currency: account.currency,
            },
            movementCount: movements.length,
            lastMovementTransactionTime:
              movements
                .map((movement) => movement.transactionTime)
                .sort()
                .at(-1) ?? null,
            updatedAt:
              movements
                .map((movement) => movement.recordedAt)
                .sort()
                .at(-1) ?? account.updatedAt,
          });
        }
        return {
          kind: "restored" as const,
          counts: Object.fromEntries(
            Object.entries(payload).map(([name, rows]) => [
              name,
              Array.isArray(rows) ? rows.length : 1,
            ]),
          ),
        };
      } catch {
        return { kind: "integrity_error" as const, reason: "malformed canonical data" };
      }
    },
  },
});
