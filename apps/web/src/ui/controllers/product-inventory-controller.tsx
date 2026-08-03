"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Cursor,
  IsoInstant,
  InventoryMovementDto,
  InventoryReclassificationId,
  Page,
  ProductId,
  QualityGradeDto,
  QualityGradeId,
  Unit,
} from "@vuarau/domain-contracts";
import {
  adjustInventoryCommandSchema,
  reclassifyInventoryCommandSchema,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import {
  InventoryAdjustmentPanel,
  type InventoryAdjustmentIntent,
} from "@/ui/patterns/inventory/inventory-adjustment-panel.tsx";
import {
  InventoryReclassificationPanel,
  type InventoryReclassificationIntent,
} from "@/ui/patterns/inventory/inventory-reclassification-panel.tsx";
import { ProductInventoryView } from "@/ui/screens/product-inventory-view.tsx";

export function ProductInventoryController() {
  const productId = useParams<{ productId: string }>().productId as ProductId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const product = useQuery(trpc.product.get.queryOptions({ workspaceId, productId }));
  const balances = useQuery(trpc.inventory.balances.queryOptions({ workspaceId, productId }));
  const valuationAsOf = useRef(new Date().toISOString() as IsoInstant).current;
  const valuation = useQuery(
    trpc.inventory.valuation.queryOptions({
      workspaceId,
      productId,
      qualityGradeId: null,
      unit: null,
      asOf: valuationAsOf,
    }),
  );
  const grades = useQuery(
    trpc.quality.list.queryOptions({ workspaceId, isActive: true, cursor: null, limit: 100 }),
  );
  const [unitFilter, setUnitFilter] = useState<Unit | null>(null);
  const [gradeFilter, setGradeFilter] = useState<QualityGradeId | null | undefined>(undefined);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<InventoryMovementDto>[]>([]);
  const timeline = useQuery(
    trpc.inventory.timeline.queryOptions({
      workspaceId,
      productId,
      qualityGradeId: gradeFilter,
      unit: unitFilter,
      cursor,
      limit: 25,
    }),
  );

  useEffect(() => {
    if (timeline.data === undefined) return;
    setPages((current) => (cursor === null ? [timeline.data] : [...current, timeline.data]));
  }, [cursor, timeline.data]);

  const refreshInventory = useCallback(() => {
    setCursor(null);
    setPages([]);
    void Promise.all([balances.refetch(), timeline.refetch()]);
  }, [balances.refetch, timeline.refetch]);
  const activeGrades = grades.data?.items ?? [];
  const rows = pages.flatMap((page) => page.items);
  const next = pages.at(-1)?.nextCursor ?? null;

  return (
    <ProductInventoryView
      productId={productId}
      productQuery={product}
      balancesQuery={balances}
      valuationQuery={valuation}
      timelineQuery={timeline}
      balances={balances.data ?? []}
      grades={activeGrades}
      movements={rows}
      gradeFilter={gradeFilter}
      unitFilter={unitFilter}
      hasMore={next !== null}
      onGradeFilterChange={(value) => {
        setGradeFilter(value);
        setCursor(null);
        setPages([]);
      }}
      onUnitFilterChange={(value) => {
        setUnitFilter(value);
        setCursor(null);
        setPages([]);
      }}
      onLoadMore={() => {
        if (next !== null) setCursor(next);
      }}
      onRetryProduct={() => void product.refetch()}
      onRetryBalances={() => void balances.refetch()}
      onRetryTimeline={() => void timeline.refetch()}
      adjustment={
        session.permissions.includes("inventory.adjust") ? (
          <InventoryAdjustmentCommandPanel
            productId={productId}
            grades={activeGrades}
            onChanged={refreshInventory}
          />
        ) : undefined
      }
      reclassification={
        session.permissions.includes("inventory.reclassify") ? (
          <InventoryReclassificationCommandPanel
            productId={productId}
            grades={activeGrades}
            onChanged={refreshInventory}
          />
        ) : undefined
      }
    />
  );
}

function InventoryAdjustmentCommandPanel(props: {
  readonly productId: ProductId;
  readonly grades: readonly QualityGradeDto[];
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const adjustmentId = useRef(crypto.randomUUID());
  const mutation = useMutation(trpc.inventory.adjust.mutationOptions());
  const command = useContractCommand(adjustInventoryCommandSchema, mutation.mutateAsync);
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (command.result === null || refreshed.current === command.result.adjustmentId) return;
    refreshed.current = command.result.adjustmentId;
    props.onChanged();
  }, [command.result, props.onChanged]);
  function submit(intent: InventoryAdjustmentIntent): void {
    void command.submit({
      adjustmentId: adjustmentId.current,
      productId: props.productId,
      ...intent,
    });
  }
  return (
    <InventoryAdjustmentPanel
      grades={props.grades}
      completed={command.result !== null}
      locked={command.phase.kind === "sending" || command.phase.kind === "unknown"}
      onSubmit={submit}
      onStartAnother={() => {
        adjustmentId.current = crypto.randomUUID();
        command.reset();
      }}
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Điều chỉnh tồn kho"
          onReload={props.onChanged}
        />
      }
    />
  );
}

function InventoryReclassificationCommandPanel(props: {
  readonly productId: ProductId;
  readonly grades: readonly QualityGradeDto[];
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const reclassificationId = useRef(crypto.randomUUID() as InventoryReclassificationId);
  const mutation = useMutation(trpc.inventory.reclassify.mutationOptions());
  const command = useContractCommand(reclassifyInventoryCommandSchema, mutation.mutateAsync);
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (command.result === null || refreshed.current === command.result.reclassificationId) return;
    refreshed.current = command.result.reclassificationId;
    props.onChanged();
  }, [command.result, props.onChanged]);
  function submit(intent: InventoryReclassificationIntent): void {
    void command.submit({
      reclassificationId: reclassificationId.current,
      productId: props.productId,
      ...intent,
    });
  }
  return (
    <InventoryReclassificationPanel
      grades={props.grades}
      completed={command.result !== null}
      locked={command.phase.kind === "sending" || command.phase.kind === "unknown"}
      onSubmit={submit}
      onStartAnother={() => {
        reclassificationId.current = crypto.randomUUID() as InventoryReclassificationId;
        command.reset();
      }}
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Chuyển phẩm cấp"
          onReload={props.onChanged}
        />
      }
    />
  );
}
