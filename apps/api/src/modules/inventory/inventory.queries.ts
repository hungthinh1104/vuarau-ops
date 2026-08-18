import type {
  InventoryValuationInput,
  InventoryValuationResult,
  ProductCoverageInput,
  StockPlanningInput,
  StockPlanningDto,
  StocktakeGetInput,
  StocktakeActiveInput,
  StocktakeLatestInput,
  StocktakePreflightInput,
  StocktakePreflightDto,
  WorkspacePolicyVersionId,
  InventoryTimelineInput,
  IsoInstant,
  ProductId,
  QualityGradeId,
  PurchaseId,
  WorkspaceId,
  Unit,
} from "@vuarau/domain-contracts";
import {
  denied,
  inventoryValuationPolicyDefinitionSchema,
  stockPlanningPolicyDefinitionSchema,
  roleHasPermission,
} from "@vuarau/domain-contracts";
import {
  activeStocktakeCounts,
  buildStocktakePreview,
  calculateInventoryValuation,
  calculateFixedThresholdPlan,
  canVoidPurchase,
  err,
  exactIntegerDifference,
  exactIntegerSum,
  ok,
  resolvePolicyForDecision,
  resolvePurchaseCorrectionPolicy,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";
import { effectiveStocktakePolicy } from "./stocktake.handlers.ts";

export async function getReceipt(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; receiptId: string },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "receiving.read",
    execute: ({ repos }) => repos.inventoryReads.receipt(input.workspaceId, input.receiptId),
  });
  if (!result.ok) return result;
  return result.value === null ? err("RECEIPT_NOT_FOUND", "No such Receipt.") : ok(result.value);
}
export async function getInventoryAdjustment(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; adjustmentId: string },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: ({ repos }) => repos.inventoryReads.adjustment(input.workspaceId, input.adjustmentId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("PRODUCT_NOT_FOUND", "No such inventory adjustment.")
    : ok(result.value);
}
export const listPurchaseReceipts = (
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; purchaseId: PurchaseId },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "receiving.read",
    execute: ({ repos }) => repos.inventoryReads.receipts(input.workspaceId, input.purchaseId),
  });
export async function getPurchaseReceivingSummary(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; purchaseId: PurchaseId },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "receiving.read",
    execute: async ({ repos, membership }) => {
      const purchase = await repos.purchases.findById(input.workspaceId, input.purchaseId);
      return {
        purchase,
        receivingFacts:
          purchase === null
            ? new Map()
            : await repos.purchaseReceipts.receivingFactsByPurchaseLine(
                input.workspaceId,
                purchase.id,
              ),
        hasActiveArrival:
          purchase === null
            ? false
            : await repos.goodsArrivals.hasActiveForPurchase(input.workspaceId, purchase.id),
        correctionPolicies: await repos.workspacePolicyReads.listAll(input.workspaceId),
        role: membership.role,
        roles: membership.roles,
      };
    },
  });
  if (!result.ok) return result;
  if (result.value.purchase === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
  const received = result.value.receivingFacts;
  const hasActiveReceipts =
    result.value.hasActiveArrival ||
    [...received.values()].some((facts) => facts.receivedNetQuantityScaled > 0);
  const correctionPolicy = resolvePurchaseCorrectionPolicy(
    result.value.correctionPolicies,
    new Date().toISOString() as IsoInstant,
  );
  const aggregateVoidCapability = canVoidPurchase({
    purchase: result.value.purchase,
    reasonCode: "other",
    hasActiveReceipts,
  });
  const aggregateCommercialCorrectionCapability = hasActiveReceipts
    ? canVoidPurchase({
        purchase: result.value.purchase,
        reasonCode: "commercial_correction",
        hasActiveReceipts,
        correctionPolicyVersionId: correctionPolicy?.policyVersionId ?? null,
      })
    : denied("PURCHASE_HAS_ACTIVE_RECEIPTS");
  const voidPurchaseCapability = roleHasPermission(result.value.roles, "purchase.void")
    ? aggregateVoidCapability
    : denied("PERMISSION_DENIED", {
        permission: "purchase.void",
        role: result.value.role,
        roles: result.value.roles,
      });
  return ok({
    purchaseId: result.value.purchase.id,
    capabilities: {
      voidPurchase: voidPurchaseCapability,
      commercialCorrection: aggregateCommercialCorrectionCapability,
    },
    lines: result.value.purchase.lines.map((line) => {
      const facts = received.get(line.lineId);
      const receivedScaled = facts?.receivedNetQuantityScaled ?? 0;
      return {
        purchaseLineId: line.lineId,
        productId: line.productId,
        productName: line.productName,
        ordered: line.quantity,
        received: { valueScaled: receivedScaled, unit: line.quantity.unit },
        remaining: {
          valueScaled:
            facts?.remainingQuantityScaled ??
            exactIntegerDifference(
              line.quantity.valueScaled,
              receivedScaled,
              "inventory.purchase_remaining.quantity_scaled",
            ),
          unit: line.quantity.unit,
        },
      };
    }),
  });
}
export const getInventoryBalances = (
  ctx: CommandContext,
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    qualityGradeId?: QualityGradeId | null | undefined;
  },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const rows = await repos.inventoryReads.balances(input.workspaceId, input.productId);
      return input.qualityGradeId === undefined
        ? rows
        : rows.filter((row) => row.qualityGradeId === input.qualityGradeId);
    },
  });

export const getProductCoverage = (ctx: CommandContext, input: ProductCoverageInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: ({ repos }) => repos.inventoryReads.coverage(input.workspaceId, input.productIds),
  });

export async function getStockPlanning(ctx: CommandContext, input: StockPlanningInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const calculatedAt = new Date().toISOString() as IsoInstant;
      const policy = resolvePolicyForDecision(
        await repos.workspacePolicyReads.listAll(input.workspaceId),
        "stock_planning_reorder",
        input.asOf,
        calculatedAt,
      );
      const unavailable = (
        diagnostics: string[],
        policyVersionId: WorkspacePolicyVersionId | null,
      ) =>
        ({
          status: "unavailable" as const,
          workspaceId: input.workspaceId,
          asOf: input.asOf,
          policyVersionId,
          strategy: null,
          calculationVersion: "stock-planning-v1" as const,
          calculatedAt,
          diagnostics,
          rows: [],
        }) satisfies StockPlanningDto;
      if (policy === null) {
        return unavailable(["no_effective_stock_planning_policy"], null);
      }
      const definition = stockPlanningPolicyDefinitionSchema.safeParse(policy.definition);
      if (!definition.success) {
        return unavailable(["invalid_stock_planning_policy"], policy.id);
      }
      const movements = (
        await Promise.all(
          definition.data.parameters.rules.map(async (rule) => {
            const sources = await repos.inventoryReads.valuationSources({
              workspaceId: input.workspaceId,
              productId: rule.productId,
              qualityGradeId: rule.qualityGradeId,
              unit: rule.unit,
              asOf: input.asOf,
            });
            return sources
              .filter((source) => source.qualityGradeId === rule.qualityGradeId)
              .map((source) => ({
                id: source.movementId,
                productId: rule.productId,
                qualityGradeId: source.qualityGradeId,
                quantity: { valueScaled: source.quantityScaled, unit: source.unit },
                transactionTime: source.transactionTime,
              }));
          }),
        )
      ).flat();
      const calculation = calculateFixedThresholdPlan({
        rules: definition.data.parameters.rules,
        movements,
        asOf: input.asOf,
      });
      if (!calculation.ok) return unavailable([calculation.error.code], policy.id);
      return {
        status: "available" as const,
        workspaceId: input.workspaceId,
        asOf: input.asOf,
        policyVersionId: policy.id,
        strategy: calculation.value.strategy,
        calculationVersion: "stock-planning-v1" as const,
        calculatedAt,
        diagnostics: [],
        rows: [...calculation.value.rows],
      } satisfies StockPlanningDto;
    },
  });
}

export async function getStocktake(ctx: CommandContext, input: StocktakeGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: ({ repos }) => repos.stocktakeReads.get(input.workspaceId, input.stocktakeSessionId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("STOCKTAKE_NOT_FOUND", "No such stocktake session.")
    : ok(result.value);
}

export async function getActiveStocktake(ctx: CommandContext, input: StocktakeActiveInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: ({ repos }) =>
      repos.stocktakeReads.findActiveByScope(input.workspaceId, input.scopeReference),
  });
}

export async function getLatestStocktakeByScope(ctx: CommandContext, input: StocktakeLatestInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: ({ repos }) =>
      repos.stocktakeReads.findLatestByScope(input.workspaceId, input.scopeReference),
  });
}

export async function getStocktakePreview(ctx: CommandContext, input: StocktakeGetInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const session = await repos.stocktakes.findById(input.workspaceId, input.stocktakeSessionId);
      if (session === null) return null;
      const activeCounts = activeStocktakeCounts(session.counts);
      const aggregates = await repos.inventoryMovements.aggregateByScopesAsOf(
        input.workspaceId,
        activeCounts.map((count) => ({
          productId: count.productId,
          qualityGradeId: count.qualityGradeId,
          unit: count.quantity.unit,
        })),
        session.asOf,
      );
      const preview = buildStocktakePreview({ session, aggregates });
      return preview.ok ? preview.value : null;
    },
  });
}

export async function getStocktakePreflight(ctx: CommandContext, input: StocktakePreflightInput) {
  return runQuery<StocktakePreflightDto>({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const policyResult = await effectiveStocktakePolicy(
        repos,
        input.workspaceId,
        input.asOf,
        ctx.deps.clock.now(),
      );
      if (!policyResult.ok) {
        return {
          canStart: false,
          policyVersionId: null,
          reasonCode: policyResult.error.code,
          message: policyResult.error.message,
        };
      }
      return {
        canStart: true,
        policyVersionId: policyResult.value.policy.id,
        reasonCode: null,
        message: null,
      };
    },
  });
}

export const getInventoryValuation = (ctx: CommandContext, input: InventoryValuationInput) =>
  runQuery<InventoryValuationResult>({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const calculatedAt = new Date().toISOString() as IsoInstant;
      const policies = await repos.workspacePolicyReads.listAll(input.workspaceId);
      const policy = resolvePolicyForDecision(
        policies,
        "inventory_valuation",
        input.asOf,
        calculatedAt,
      );
      const sources = await repos.inventoryReads.valuationSources({
        workspaceId: input.workspaceId,
        productId: input.productId,
        qualityGradeId: input.qualityGradeId,
        unit: input.unit,
        asOf: input.asOf,
      });
      const unavailable = (
        diagnostics: readonly string[],
        policyVersionId: WorkspacePolicyVersionId | null,
      ) => ({
        status: "unavailable" as const,
        workspaceId: input.workspaceId,
        productId: input.productId,
        asOf: input.asOf,
        policyVersionId,
        calculationVersion: "inventory-valuation-v1" as const,
        calculatedAt,
        integrity: "attention" as const,
        diagnostics: [...diagnostics],
        inputReferences: sources.map((source) => ({
          movementId: source.movementId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          sourceLineId: source.sourceLineId,
        })),
        currency: null,
      });
      if (policy === null) {
        return unavailable(["no_effective_inventory_valuation_policy"], null);
      }
      const definition = inventoryValuationPolicyDefinitionSchema.safeParse(policy.definition);
      if (!definition.success) {
        return unavailable(["invalid_inventory_valuation_policy"], policy.id);
      }
      const calculations = calculateInventoryValuation(
        sources,
        definition.data.parameters.strategy,
      );
      const diagnostics = [...new Set(calculations.flatMap((row) => row.diagnostics))];
      if (diagnostics.length > 0) return unavailable(diagnostics, policy.id);
      const moneyValues = calculations.flatMap((row) =>
        [row.inventoryValue, row.cogs, row.classifiedLossCost, row.averageUnitCost].filter(
          (value): value is NonNullable<typeof value> => value !== null,
        ),
      );
      const currencies = [...new Set(moneyValues.map((value) => value.currency))];
      if (currencies.length > 1) return unavailable(["mixed_currency"], policy.id);
      return {
        status: "available" as const,
        workspaceId: input.workspaceId,
        productId: input.productId,
        asOf: input.asOf,
        policyVersionId: policy.id,
        strategy: definition.data.parameters.strategy,
        calculationVersion: "inventory-valuation-v1" as const,
        calculatedAt,
        integrity: "healthy" as const,
        diagnostics: [],
        inputReferences: sources.map((source) => ({
          movementId: source.movementId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          sourceLineId: source.sourceLineId,
        })),
        rows: calculations.map((row) => ({
          qualityGradeId: row.qualityGradeId,
          unit: row.unit,
          quantityScaled: row.quantityScaled,
          inventoryValue: row.inventoryValue,
          cogs: row.cogs,
          classifiedLossCost: row.classifiedLossCost,
          averageUnitCost: row.averageUnitCost,
        })),
        currency: currencies[0] ?? null,
      };
    },
  });
export const getInventoryTimeline = (ctx: CommandContext, input: InventoryTimelineInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.inventoryReads.timeline({
          workspaceId: input.workspaceId,
          productId: input.productId,
          qualityGradeId: input.qualityGradeId,
          unit: input.unit,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export const getInventoryReconciliation = (
  ctx: CommandContext,
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    qualityGradeId: QualityGradeId | null;
    unit: Unit;
  },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const product = await repos.products.findById(input.workspaceId, input.productId);
      if (product === null)
        return {
          status: "not_found" as const,
          productId: input.productId,
          qualityGradeId: input.qualityGradeId,
          unit: input.unit,
          projected: null,
          canonical: null,
          diagnostics: ["product_not_found"],
        };
      const [movements, projections, integrity] = await Promise.all([
        repos.inventoryMovements.listByProduct(input.workspaceId, input.productId, input.unit),
        repos.inventoryReads.balances(input.workspaceId, input.productId),
        repos.inventoryReads.integrity(
          input.workspaceId,
          input.productId,
          input.qualityGradeId,
          input.unit,
        ),
      ]);
      const gradedMovements = movements.filter(
        (movement) => movement.qualityGradeId === input.qualityGradeId,
      );
      const quantityScaled = exactIntegerSum(
        gradedMovements.map((movement) => movement.quantity.valueScaled),
        "inventory.balance.quantity_scaled",
      );
      const last = gradedMovements.reduce<null | string>(
        (current, movement) =>
          current === null || movement.transactionTime > current
            ? movement.transactionTime
            : current,
        null,
      ) as IsoInstant | null;
      const projected =
        projections.find(
          (row) => row.unit === input.unit && row.qualityGradeId === input.qualityGradeId,
        ) ?? null;
      const canonical = {
        workspaceId: input.workspaceId,
        productId: input.productId,
        qualityGradeId: input.qualityGradeId,
        qualityGradeName: projected?.qualityGradeName ?? null,
        unit: input.unit,
        quantityScaled,
        classification:
          quantityScaled > 0
            ? ("positive" as const)
            : quantityScaled < 0
              ? ("negative" as const)
              : ("zero" as const),
        movementCount: gradedMovements.length,
        lastMovementTransactionTime: last,
        updatedAt: gradedMovements[gradedMovements.length - 1]?.recordedAt ?? product.updatedAt,
      };
      if (integrity.length > 0)
        return {
          status: "integrity_failure" as const,
          productId: input.productId,
          qualityGradeId: input.qualityGradeId,
          unit: input.unit,
          projected,
          canonical,
          diagnostics: [...integrity],
        };
      const diagnostics = [
        ...(projected === null ? ["projection_missing"] : []),
        ...(projected !== null && projected.quantityScaled !== quantityScaled
          ? ["quantity_drift"]
          : []),
        ...(projected !== null && projected.movementCount !== gradedMovements.length
          ? ["movement_count_drift"]
          : []),
        ...(projected !== null && projected.lastMovementTransactionTime !== last
          ? ["latest_transaction_drift"]
          : []),
      ];
      return {
        status: diagnostics.length === 0 ? ("consistent" as const) : ("inconsistent" as const),
        productId: input.productId,
        qualityGradeId: input.qualityGradeId,
        unit: input.unit,
        projected,
        canonical,
        diagnostics,
      };
    },
  });
