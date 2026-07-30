"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ProductId,
  PurchaseDto,
  PurchaseId,
  PurchaseLineId,
  SupplierId,
  Unit,
} from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";
import { Select } from "@/ui/primitives/select.tsx";

type DraftLine = {
  lineId: PurchaseLineId;
  productId: ProductId | "";
  productName: string;
  quantity: string;
  unit: Unit;
  price: string;
};
const newLine = (): DraftLine => ({
  lineId: crypto.randomUUID() as PurchaseLineId,
  productId: "",
  productName: "",
  quantity: "1",
  unit: "kg",
  price: "",
});

export default function NewPurchasePage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const replacesPurchaseId = useSearchParams().get("replacesPurchaseId") as PurchaseId | null;
  const purchaseId = useRef(crypto.randomUUID() as PurchaseId).current;
  const [supplierId, setSupplierId] = useState<SupplierId | "">("");
  const [lines, setLines] = useState<readonly DraftLine[]>([newLine()]);
  const [note, setNote] = useState("");
  const suppliers = useQuery(
    trpc.supplier.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const createMutation = useMutation(trpc.purchase.createDraft.mutationOptions());
  const confirmMutation = useMutation(trpc.purchase.confirm.mutationOptions());
  const create = useCommand<unknown, PurchaseDto>((envelope) =>
    createMutation.mutateAsync(envelope as never),
  );
  const confirm = useCommand<unknown, PurchaseDto>((envelope) =>
    confirmMutation.mutateAsync(envelope as never),
  );
  const payloadLines = lines.map((line) => ({
    lineId: line.lineId,
    productId: line.productId as ProductId,
    productName: line.productName.trim(),
    quantity: { valueScaled: Math.round(Number(line.quantity) * 1000), unit: line.unit },
    unitPrice: { amountMinor: Math.round(Number(line.price) * 1000), currency: "VND" as const },
  }));
  const valid =
    supplierId !== "" &&
    payloadLines.length > 0 &&
    payloadLines.every(
      (line) =>
        line.productName.length > 0 &&
        line.quantity.valueScaled > 0 &&
        Number.isSafeInteger(line.quantity.valueScaled) &&
        line.unitPrice.amountMinor >= 0 &&
        Number.isSafeInteger(line.unitPrice.amountMinor),
    );
  const submitDraft = () =>
    create.submit({
      purchaseId,
      supplierId,
      currency: "VND",
      lines: payloadLines,
      note: note.trim() || null,
      dueAt: null,
      replacesPurchaseId,
    });
  const save = async (shouldConfirm: boolean) => {
    const draft = await submitDraft();
    if (draft === null) return;
    if (!shouldConfirm) {
      router.replace(`/purchases/${draft.id}`);
      return;
    }
    const confirmed = await confirm.submit(
      { purchaseId: draft.id },
      { expectedVersion: draft.version },
    );
    if (confirmed !== null) router.replace(`/purchases/${confirmed.id}`);
  };
  if (!session.permissions.includes("purchase.create"))
    return <p role="alert">Bạn không có quyền tạo đơn mua.</p>;
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Tạo đơn mua" back={{ href: "/purchases", label: "Đơn mua" }} />
      <Select
        label="Nhà cung cấp"
        value={supplierId}
        onChange={(event) => setSupplierId(event.target.value as SupplierId)}
        placeholder="Chọn nhà cung cấp đang hoạt động"
        options={(suppliers.data?.items ?? []).map((supplier) => ({
          value: supplier.id,
          label: supplier.displayName,
        }))}
      />
      {lines.map((line, index) => (
        <fieldset
          key={line.lineId}
          className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-5"
        >
          <legend className="px-2 font-semibold">Dòng {index + 1}</legend>
          <Select
            label="Mặt hàng"
            value={line.productId}
            onChange={(event) => {
              const product = products.data?.items.find((item) => item.id === event.target.value);
              if (product === undefined) return;
              setLines((current) =>
                current.map((item) =>
                  item.lineId === line.lineId
                    ? {
                        ...item,
                        productId: product.id,
                        productName: product.displayName,
                        unit: product.preferredUnit ?? item.unit,
                      }
                    : item,
                ),
              );
            }}
            placeholder="Chọn mặt hàng"
            options={(products.data?.items ?? []).map((product) => ({
              value: product.id,
              label: product.displayName,
            }))}
          />
          <label className="text-label">
            Số lượng
            <input
              className={INPUT_CLASS}
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item) =>
                    item.lineId === line.lineId ? { ...item, quantity: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <Select
            label="Đơn vị"
            value={line.unit}
            onChange={(event) =>
              setLines((current) =>
                current.map((item) =>
                  item.lineId === line.lineId
                    ? { ...item, unit: event.target.value as Unit }
                    : item,
                ),
              )
            }
            options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }))}
          />
          <label className="text-label">
            Đơn giá (nghìn đồng)
            <input
              className={INPUT_CLASS}
              inputMode="numeric"
              value={line.price}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item) =>
                    item.lineId === line.lineId ? { ...item, price: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <Button
            tone="secondary"
            disabled={lines.length === 1}
            onClick={() =>
              setLines((current) => current.filter((item) => item.lineId !== line.lineId))
            }
          >
            Xoá dòng
          </Button>
        </fieldset>
      ))}
      <Button tone="secondary" onClick={() => setLines((current) => [...current, newLine()])}>
        Thêm dòng
      </Button>
      <label className="text-label">
        Ghi chú
        <textarea
          className={INPUT_CLASS}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          tone="secondary"
          disabled={!valid || create.phase.kind === "sending"}
          onClick={() => void save(false)}
        >
          Lưu nháp
        </Button>
        {session.permissions.includes("purchase.confirm") ? (
          <Button
            disabled={!valid || create.phase.kind === "sending" || confirm.phase.kind === "sending"}
            onClick={() => void save(true)}
          >
            Xác nhận đơn mua
          </Button>
        ) : null}
      </div>
      <CommandOutcome command={create} attemptedAction="Lưu đơn mua" onReload={() => undefined} />
      <CommandOutcome
        command={confirm}
        attemptedAction="Xác nhận đơn mua"
        onReload={() => undefined}
      />
    </div>
  );
}
