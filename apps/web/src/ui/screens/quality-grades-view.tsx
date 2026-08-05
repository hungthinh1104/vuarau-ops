"use client";

import type { Page, QualityGradeDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

export type QualityGradeActiveFilter = "all" | "active" | "inactive";

export type QualityGradesViewProps = {
  readonly query: QueryLike<Page<QualityGradeDto>>;
  readonly mayManage: boolean;
  readonly search: string;
  readonly activeFilter: QualityGradeActiveFilter;
  readonly createName: string;
  readonly createSortOrder: string;
  readonly createFeedback?: ReactNode;
  readonly renderGrade: (grade: QualityGradeDto) => ReactNode;
  readonly onSearchChange: (value: string) => void;
  readonly onFilterChange: (value: QualityGradeActiveFilter) => void;
  readonly onCreateNameChange: (value: string) => void;
  readonly onCreateSortOrderChange: (value: string) => void;
  readonly onCreate: () => void;
  readonly onRetry: () => void;
};

export function QualityGradesView({
  query,
  mayManage,
  search,
  activeFilter,
  createName,
  createSortOrder,
  createFeedback,
  renderGrade,
  onSearchChange,
  onFilterChange,
  onCreateNameChange,
  onCreateSortOrderChange,
  onCreate,
  onRetry,
}: QualityGradesViewProps) {
  const parsedOrder = Number(createSortOrder);
  const canCreate = createName.trim().length > 0 && Number.isInteger(parsedOrder);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Hạng hàng"
        description="Danh mục hạng hàng của lượng hàng, ví dụ Loại 1 / Loại 2 / Dạt. Đây không phải nơi ghi lỗi hàng."
      />

      <p className="rounded-card border border-info/30 bg-info-soft px-4 py-3 text-body-sm">
        Theo cách vận hành hiện tại, đơn bán và lượng nhận mới phải chọn một hạng hàng đang dùng.
        Không tạo hạng hàng “mặc định” chỉ để bỏ qua quyết định.
      </p>

      {mayManage ? (
        <section className="grid gap-3 border-y border-border py-4 sm:grid-cols-[1fr_10rem_auto]">
          <TextInput
            label="Tên hạng hàng"
            placeholder="Ví dụ: Loại 1"
            value={createName}
            onChange={(event) => onCreateNameChange(event.target.value)}
          />
          <TextInput
            label="Thứ tự"
            inputMode="numeric"
            value={createSortOrder}
            onChange={(event) => onCreateSortOrderChange(event.target.value)}
          />
          <Button className="self-end" disabled={!canCreate} onClick={onCreate}>
            Thêm hạng hàng
          </Button>
          {createFeedback === undefined ? null : (
            <div className="sm:col-span-3">{createFeedback}</div>
          )}
        </section>
      ) : null}

      <section className="grid gap-3 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <SearchInput
          label="Tìm hạng hàng"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onClear={() => onSearchChange("")}
          placeholder="Tên hạng hàng"
        />
        <FilterChipGroup
          label="Lọc trạng thái hạng hàng"
          value={activeFilter}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "active", label: "Đang dùng" },
            { value: "inactive", label: "Đã ngưng" },
          ]}
          onChange={onFilterChange}
        />
      </section>

      <QueryStates
        query={query}
        loadingLabel="Đang tải hạng hàng"
        attemptedAction="Xem danh mục hạng hàng"
        onRetry={onRetry}
      >
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title={search.trim().length > 0 ? "Không tìm thấy hạng hàng" : "Chưa có hạng hàng"}
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
              {page.items.map((grade) => renderGrade(grade))}
            </ul>
          )
        }
      </QueryStates>
    </div>
  );
}
