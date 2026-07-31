"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QualityGradeDto } from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import {
  QualityGradeRow,
  type QualityGradeLifecycleIntent,
  type QualityGradeUpdateIntent,
} from "@/ui/patterns/quality/quality-grade-row.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

type ActiveFilter = "all" | "active" | "inactive";

export default function QualityGradesPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("10");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const debouncedSearch = useDebounced(search, 200);
  const gradeId = useRef(crypto.randomUUID());
  const mayManage = session.permissions.includes("quality.manage");

  const list = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: debouncedSearch,
      isActive: activeFilter === "all" ? null : activeFilter === "active" ? true : false,
      cursor: null,
      limit: 100,
    }),
  );

  const createMutation = useMutation(trpc.quality.create.mutationOptions());
  const createCommand = useCommand<
    { qualityGradeId: string; name: string; sortOrder: number },
    QualityGradeDto
  >(async (envelope) => (await createMutation.mutateAsync(envelope as never)) as QualityGradeDto);

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
    gradeId.current = crypto.randomUUID();
    setName("");
    await refresh();
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Phẩm cấp hàng"
        description="Danh mục phân hạng thương mại của lượng hàng, ví dụ Loại 1 / Loại 2 / Dạt. Đây chưa phải hệ thống kiểm định chất lượng hay ghi lỗi hàng."
      />

      <p className="rounded-card border border-info/30 bg-info-soft px-4 py-3 text-body-sm">
        Theo chính sách phần mềm hiện tại, đơn bán và lượng nhận mới phải chọn một phẩm cấp đang
        dùng. Chính sách này còn chờ chủ vựa xác nhận trước pilot; không tạo phẩm cấp “mặc định” chỉ
        để bỏ qua quyết định.
      </p>

      {mayManage ? (
        <section className="grid gap-3 border-y border-border py-4 sm:grid-cols-[1fr_10rem_auto]">
          <TextInput
            label="Tên phẩm cấp"
            placeholder="Ví dụ: Loại 1"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextInput
            label="Thứ tự"
            inputMode="numeric"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
          <Button className="self-end" onClick={() => void create()}>
            Thêm phẩm cấp
          </Button>
          <div className="sm:col-span-3">
            <CommandOutcome
              command={createCommand}
              attemptedAction="Tạo phẩm cấp hàng"
              onReload={() => void refresh()}
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <SearchInput
          label="Tìm phẩm cấp"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch("")}
          placeholder="Tên phẩm cấp"
        />
        <FilterChipGroup
          label="Lọc trạng thái phẩm cấp"
          value={activeFilter}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "active", label: "Đang dùng" },
            { value: "inactive", label: "Đã ngưng" },
          ]}
          onChange={setActiveFilter}
        />
      </section>

      <QueryStates
        query={list}
        loadingLabel="Đang tải phẩm cấp"
        attemptedAction="Xem danh mục phẩm cấp"
        onRetry={() => void list.refetch()}
      >
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title={search.trim().length > 0 ? "Không tìm thấy phẩm cấp" : "Chưa có phẩm cấp"}
              description={
                search.trim().length > 0
                  ? "Đổi từ khoá hoặc trạng thái lọc để tìm lại."
                  : mayManage
                    ? "Hãy ghi đúng cách vựa thực sự phân hạng hàng trước khi pilot."
                    : "Chủ vựa hoặc nhân sự kho có quyền quản lý cần cấu hình trước khi giao dịch mới."
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border bg-surface">
              {page.items.map((grade) => (
                <QualityGradeCommandRow
                  key={grade.id}
                  grade={grade}
                  mayManage={mayManage}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )
        }
      </QueryStates>
    </div>
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
  const update = useCommand<unknown, QualityGradeDto>((envelope) =>
    updateMutation.mutateAsync(envelope as never),
  );
  const lifecycle = useCommand<unknown, QualityGradeDto>((envelope) =>
    props.grade.isActive
      ? deactivateMutation.mutateAsync(envelope as never)
      : reactivateMutation.mutateAsync(envelope as never),
  );

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
        <div className="grid gap-2">
          <CommandOutcome
            command={update}
            attemptedAction="Cập nhật phẩm cấp"
            onReload={() => void props.onChanged()}
          />
          <CommandOutcome
            command={lifecycle}
            attemptedAction="Đổi trạng thái phẩm cấp"
            onReload={() => void props.onChanged()}
          />
        </div>
      }
    />
  );
}
