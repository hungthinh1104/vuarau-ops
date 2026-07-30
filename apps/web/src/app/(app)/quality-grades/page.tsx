"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QualityGradeDto } from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export default function QualityGradesPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("10");
  const gradeId = useRef(crypto.randomUUID());
  const list = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: "",
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const mutation = useMutation(trpc.quality.create.mutationOptions());
  const command = useCommand<
    { qualityGradeId: string; name: string; sortOrder: number },
    QualityGradeDto
  >(async (envelope) => (await mutation.mutateAsync(envelope as never)) as QualityGradeDto);
  const mayManage = session.permissions.includes("quality.manage");

  async function create(): Promise<void> {
    const order = Number(sortOrder);
    if (!mayManage || name.trim().length === 0 || !Number.isInteger(order)) return;
    const created = await command.submit({
      qualityGradeId: gradeId.current,
      name: name.trim(),
      sortOrder: order,
    });
    if (created === null) return;
    gradeId.current = crypto.randomUUID();
    command.reset();
    setName("");
    await queryClient.invalidateQueries({ queryKey: trpc.quality.list.queryKey() });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Phân hạng chất lượng"
        description="Phân hạng thuộc từng lượng hàng. Đổi tên sau này không sửa lại chứng từ đã ghi."
      />
      {mayManage ? (
        <section className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_10rem_auto]">
          <TextInput
            label="Tên phân hạng"
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
            Thêm phân hạng
          </Button>
          <div className="sm:col-span-3">
            <CommandOutcome
              command={command}
              attemptedAction="Tạo phân hạng chất lượng"
              onReload={() => window.location.reload()}
            />
          </div>
        </section>
      ) : null}
      <QueryStates
        query={list}
        loadingLabel="Đang tải phân hạng"
        onRetry={() => void list.refetch()}
      >
        {(page) => (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {page.items.map((grade) => (
              <li key={grade.id} className="flex items-center justify-between px-4 py-3">
                <span>
                  <strong>{grade.name}</strong>
                  <span className="ml-2 text-caption text-ink-muted">thứ tự {grade.sortOrder}</span>
                </span>
                {grade.isActive ? (
                  <Badge tone="positive">Đang dùng</Badge>
                ) : (
                  <Badge>Đã ngưng</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryStates>
    </div>
  );
}
