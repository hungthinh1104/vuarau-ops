import type {
  DeliveryGetInput,
  DeliveryListInput,
  SaleFulfilmentDto,
  SaleFulfilmentInput,
} from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
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
    execute: async ({ repos }): Promise<SaleFulfilmentDto> => {
      const sale = await repos.saleReads.get(input.workspaceId, input.saleId);
      if (sale === null) return { saleId: input.saleId, integrity: "attention", lines: [] };
      const fulfilment = await repos.deliveries.fulfilmentBySaleLine(
        input.workspaceId,
        input.saleId,
      );
      return {
        saleId: input.saleId,
        integrity: "healthy",
        lines: sale.lines.map((line) => {
          const amounts = fulfilment.get(line.lineId) ?? { dispatched: 0, returned: 0 };
          const net = amounts.dispatched - amounts.returned;
          return {
            saleLineId: line.lineId,
            productId: line.productId,
            productName: line.productName,
            ordered: line.quantity,
            dispatched: { valueScaled: amounts.dispatched, unit: line.quantity.unit },
            returned: { valueScaled: amounts.returned, unit: line.quantity.unit },
            remaining: {
              valueScaled: line.quantity.valueScaled - net,
              unit: line.quantity.unit,
            },
          };
        }),
      };
    },
  });
}
