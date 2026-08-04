"use client";

import { useQueryClient } from "@tanstack/react-query";
import type {
  DeliveryDto,
  CustomerId,
  Page,
  PurchaseDto,
  SaleDetailDto,
  SaleSummaryDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { useCallback } from "react";
import { useTRPC } from "./providers.tsx";

function prependPage<T extends { readonly id: string }>(page: Page<T> | undefined, item: T) {
  if (page === undefined) return page;
  if (page.items.some((candidate) => candidate.id === item.id)) return page;
  return { ...page, items: [item, ...page.items] };
}

/**
 * One cache policy for the operational workflows. Commands remain separate in
 * the API; this hook only describes which read models become stale after a
 * canonical fact changes.
 */
export function useWorkflowCacheEffects() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const reportsChanged = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.report.operational.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.report.intelligence.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.summary.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.salesSeries.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.orderStatusCounts.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.topProducts.queryKey() }),
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.operationsBoard.infiniteQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.operationsBoardCounts.queryKey(),
        }),
      ]),
    [queryClient, trpc.dashboard, trpc.report.intelligence, trpc.report.operational],
  );

  const inventoryChanged = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.inventory.balances.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventory.timeline.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventory.valuation.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventory.planning.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventory.reconciliation.queryKey() }),
      ]),
    [queryClient, trpc.inventory],
  );

  const purchaseChanged = useCallback(
    async (workspaceId: WorkspaceId, purchaseId: PurchaseDto["id"]): Promise<void> => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.purchase.list.queryKey() }),
        queryClient.invalidateQueries({
          queryKey: trpc.purchase.get.queryKey({ workspaceId, purchaseId }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.receiving.listForPurchase.queryKey({ workspaceId, purchaseId }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.receiving.summaryForPurchase.queryKey({ workspaceId, purchaseId }),
        }),
        queryClient.invalidateQueries({ queryKey: trpc.supplier.search.queryKey() }),
        reportsChanged(),
      ]);
    },
    [queryClient, reportsChanged, trpc.purchase, trpc.receiving, trpc.supplier],
  );

  const purchaseCreated = useCallback(
    async (workspaceId: WorkspaceId, purchase: PurchaseDto): Promise<void> => {
      queryClient.setQueryData<Page<PurchaseDto>>(
        trpc.purchase.list.queryKey({
          workspaceId,
          supplierId: null,
          status: null,
          cursor: null,
          limit: 25,
        }),
        (current) => prependPage(current, purchase),
      );
      await purchaseChanged(workspaceId, purchase.id);
    },
    [purchaseChanged, queryClient, trpc.purchase],
  );

  const saleChanged = useCallback(
    async (
      workspaceId: WorkspaceId,
      sale: Pick<SaleSummaryDto, "id"> | Pick<SaleDetailDto["sale"], "id" | "customerId">,
    ): Promise<void> => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.sale.list.queryKey() }),
        queryClient.invalidateQueries({
          queryKey: trpc.sale.detail.queryKey({ workspaceId, saleId: sale.id }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.sale.get.queryKey({ workspaceId, saleId: sale.id }),
        }),
        queryClient.invalidateQueries({ queryKey: trpc.delivery.list.queryKey() }),
        queryClient.invalidateQueries({
          queryKey: trpc.delivery.fulfilment.queryKey({ workspaceId, saleId: sale.id }),
        }),
        queryClient.invalidateQueries({ queryKey: trpc.customer.search.queryKey() }),
        reportsChanged(),
      ]);
    },
    [queryClient, reportsChanged, trpc.customer, trpc.delivery, trpc.sale],
  );

  const deliveryChanged = useCallback(
    async (workspaceId: WorkspaceId, delivery: DeliveryDto): Promise<void> => {
      queryClient.setQueryData<Page<DeliveryDto>>(
        trpc.delivery.list.queryKey({
          workspaceId,
          saleId: null,
          status: null,
          cursor: null,
          limit: 25,
        }),
        (current) => prependPage(current, delivery),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.delivery.list.queryKey() }),
        queryClient.invalidateQueries({
          queryKey: trpc.delivery.get.queryKey({ workspaceId, deliveryId: delivery.id }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.delivery.fulfilment.queryKey({ workspaceId, saleId: delivery.saleId }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.sale.detail.queryKey({ workspaceId, saleId: delivery.saleId }),
        }),
        inventoryChanged(),
        reportsChanged(),
      ]);
    },
    [inventoryChanged, queryClient, reportsChanged, trpc.delivery, trpc.sale],
  );

  const customerChanged = useCallback(
    async (workspaceId: WorkspaceId, customerId: CustomerId): Promise<void> => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.customer.recent.queryKey() }),
        queryClient.invalidateQueries({
          queryKey: trpc.customer.get.queryKey({ workspaceId, customerId }),
        }),
        reportsChanged(),
      ]);
    },
    [queryClient, reportsChanged, trpc.customer],
  );

  const receivingChanged = useCallback(
    async (workspaceId: WorkspaceId, purchaseId: PurchaseDto["id"]): Promise<void> => {
      await Promise.all([purchaseChanged(workspaceId, purchaseId), inventoryChanged()]);
    },
    [inventoryChanged, purchaseChanged],
  );

  return {
    customerChanged,
    deliveryChanged,
    inventoryChanged,
    purchaseChanged,
    purchaseCreated,
    receivingChanged,
    reportsChanged,
    saleChanged,
  };
}
