import type {
  DeliveryGetInput,
  DeliveryListInput,
  SaleFulfilmentDto,
  SaleFulfilmentInput,
} from "@vuarau/domain-contracts";
import { denied, roleHasPermission } from "@vuarau/domain-contracts";
import { canCreateDeliveryDraftForSale, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export async function getDelivery(ctx: CommandContext, input: DeliveryGetInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "delivery.read",
    execute: ({ repos }) => repos.deliveryReads.get(input.workspaceId, input.deliveryId),
  });
  if (!result.ok) return result;
  return result.value === null ? err("DELIVERY_NOT_FOUND", "No such Delivery.") : ok(result.value);
}

export const listDeliveries = (ctx: CommandContext, input: DeliveryListInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "delivery.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.deliveryReads.list({
          workspaceId: input.workspaceId,
          saleId: input.saleId,
          status: input.status,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export async function getSaleFulfilment(ctx: CommandContext, input: SaleFulfilmentInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "delivery.read",
    execute: async ({ repos, membership }): Promise<SaleFulfilmentDto> => {
      const sale = await repos.saleReads.get(input.workspaceId, input.saleId);
      if (sale === null) {
        return {
          saleId: input.saleId,
          integrity: "attention",
          capabilities: { createDelivery: denied("SALE_NOT_FOUND") },
          lines: [],
        };
      }
      const fulfilment = await repos.deliveries.fulfilmentBySaleLine(
        input.workspaceId,
        input.saleId,
      );
      let replacementAncestryHasFulfilment = false;
      let predecessorSaleId = sale.replacesSaleId;
      const visitedSaleIds = new Set<string>();
      while (predecessorSaleId !== null) {
        if (visitedSaleIds.has(predecessorSaleId)) {
          replacementAncestryHasFulfilment = true;
          break;
        }
        visitedSaleIds.add(predecessorSaleId);
        const predecessorFulfilment = await repos.deliveries.netFulfilledBySaleLine(
          input.workspaceId,
          predecessorSaleId,
          null,
        );
        if ([...predecessorFulfilment.values()].some((value) => value > 0)) {
          replacementAncestryHasFulfilment = true;
          break;
        }
        const predecessorSale = await repos.saleReads.get(input.workspaceId, predecessorSaleId);
        if (predecessorSale === null) {
          replacementAncestryHasFulfilment = true;
          break;
        }
        predecessorSaleId = predecessorSale.replacesSaleId;
      }
      const aggregateCreateCapability = canCreateDeliveryDraftForSale({
        sale,
        replacementAncestryHasFulfilment,
      });
      const createDeliveryCapability = roleHasPermission(membership.roles, "delivery.create")
        ? aggregateCreateCapability
        : denied("PERMISSION_DENIED", {
            permission: "delivery.create",
            role: membership.role,
          });
      const lines: SaleFulfilmentDto["lines"] = sale.lines.map((line) => {
        const amounts = fulfilment.get(line.lineId) ?? { dispatched: 0, returned: 0 };
        const net = amounts.dispatched - amounts.returned;
        const remaining = line.quantity.valueScaled - net;
        const invalid =
          line.productId === null ||
          (line.qualityGradeId !== null && line.qualityGradeName === null) ||
          amounts.dispatched < 0 ||
          amounts.returned < 0 ||
          amounts.returned > amounts.dispatched ||
          net < 0 ||
          net > line.quantity.valueScaled;
        const fulfilmentState = invalid
          ? ("attention" as const)
          : remaining === 0
            ? ("fulfilled" as const)
            : amounts.returned > 0
              ? ("returned_partial" as const)
              : net > 0
                ? ("partially_fulfilled" as const)
                : ("unfulfilled" as const);
        return {
          saleLineId: line.lineId,
          productId: line.productId,
          productName: line.productName,
          qualityGradeId: line.qualityGradeId,
          qualityGradeName: line.qualityGradeName,
          ordered: line.quantity,
          dispatched: { valueScaled: amounts.dispatched, unit: line.quantity.unit },
          returned: { valueScaled: amounts.returned, unit: line.quantity.unit },
          netFulfilled: { valueScaled: net, unit: line.quantity.unit },
          remaining: { valueScaled: remaining, unit: line.quantity.unit },
          fulfilmentState,
          blockedReason:
            line.productId === null
              ? "legacy_product_unresolved"
              : line.qualityGradeId !== null && line.qualityGradeName === null
                ? "legacy_quality_unclassified"
                : invalid
                  ? "fulfilment_integrity_error"
                  : null,
        };
      });
      return {
        saleId: input.saleId,
        integrity: lines.some((line) => line.fulfilmentState === "attention")
          ? "attention"
          : "healthy",
        capabilities: { createDelivery: createDeliveryCapability },
        lines,
      };
    },
  });
}
