"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createQualityGradeCommandSchema,
  deactivateQualityGradeCommandSchema,
  reactivateQualityGradeCommandSchema,
  updateQualityGradeCommandSchema,
  type QualityGradeDto,
  type QualityGradeId,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import {
  QualityGradeRow,
  type QualityGradeLifecycleIntent,
  type QualityGradeUpdateIntent,
} from "@/ui/patterns/quality/quality-grade-row.tsx";
import {
  QualityGradesView,
  type QualityGradeActiveFilter,
} from "@/ui/screens/quality-grades-view.tsx";

export function QualityGradesController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("10");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<QualityGradeActiveFilter>("all");
  const debouncedSearch = useDebounced(search, 200);
  const gradeId = useRef(crypto.randomUUID() as QualityGradeId);
  const mayManage = session.permissions.includes("quality.manage");

  const list = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: debouncedSearch,
      isActive: activeFilter === "all" ? null : activeFilter === "active",
      cursor: null,
      limit: 100,
    }),
  );

  const createMutation = useMutation(trpc.quality.create.mutationOptions());
  const createCommand = useContractCommand(
    createQualityGradeCommandSchema,
    createMutation.mutateAsync,
  );

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: trpc.quality.list.queryKey() });
  }

  async function create(): Promise<void> {
    const order = Number(sortOrder);
    if (!mayManage || name.trim().length === 0 || !Number.isInteger(order)) return;
    const created = await createCommand.submit({
      qualityGradeId: gradeId.current,
      name: name.trim(),
      sortOrder: order,
    });
    if (created === null) return;
    gradeId.current = crypto.randomUUID() as QualityGradeId;
    setName("");
    await refresh();
  }

  return (
    <QualityGradesView
      query={list}
      mayManage={mayManage}
      search={search}
      activeFilter={activeFilter}
      createName={name}
      createSortOrder={sortOrder}
      createFeedback={
        <CommandOutcome
          command={createCommand}
          attemptedAction="Tạo hạng hàng"
          onReload={() => void refresh()}
        />
      }
      renderGrade={(grade) => (
        <QualityGradeCommandRow
          key={grade.id}
          grade={grade}
          mayManage={mayManage}
          onChanged={refresh}
        />
      )}
      onSearchChange={setSearch}
      onFilterChange={setActiveFilter}
      onCreateNameChange={setName}
      onCreateSortOrderChange={setSortOrder}
      onCreate={() => void create()}
      onRetry={() => void list.refetch()}
    />
  );
}

function QualityGradeCommandRow(props: {
  readonly grade: QualityGradeDto;
  readonly mayManage: boolean;
  readonly onChanged: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const updateMutation = useMutation(trpc.quality.update.mutationOptions());
  const deactivateMutation = useMutation(trpc.quality.deactivate.mutationOptions());
  const reactivateMutation = useMutation(trpc.quality.reactivate.mutationOptions());
  const update = useContractCommand(updateQualityGradeCommandSchema, updateMutation.mutateAsync);
  const deactivate = useContractCommand(
    deactivateQualityGradeCommandSchema,
    deactivateMutation.mutateAsync,
  );
  const reactivate = useContractCommand(
    reactivateQualityGradeCommandSchema,
    reactivateMutation.mutateAsync,
  );
  const lifecycle = props.grade.isActive ? deactivate : reactivate;

  async function handleUpdate(intent: QualityGradeUpdateIntent): Promise<boolean> {
    const result = await update.submit(
      {
        qualityGradeId: props.grade.id,
        name: intent.name,
        sortOrder: intent.sortOrder,
      },
      { expectedVersion: props.grade.version },
    );
    if (result === null) return false;
    await props.onChanged();
    return true;
  }

  async function handleLifecycle(intent: QualityGradeLifecycleIntent): Promise<boolean> {
    if (intent.active === props.grade.isActive) return false;
    const result = await lifecycle.submit(
      {
        qualityGradeId: props.grade.id,
        reason: intent.reason,
      },
      { expectedVersion: props.grade.version },
    );
    if (result === null) return false;
    await props.onChanged();
    return true;
  }

  return (
    <QualityGradeRow
      grade={props.grade}
      mayManage={props.mayManage}
      onUpdate={handleUpdate}
      onLifecycle={handleLifecycle}
      feedback={
        <>
          <CommandOutcome
            command={update}
            attemptedAction="Cập nhật hạng hàng"
            onReload={() => void props.onChanged()}
          />
          <CommandOutcome
            command={lifecycle}
            attemptedAction="Đổi trạng thái hạng hàng"
            onReload={() => void props.onChanged()}
          />
        </>
      }
    />
  );
}
