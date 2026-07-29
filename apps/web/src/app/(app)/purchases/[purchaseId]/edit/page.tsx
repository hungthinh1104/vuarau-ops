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
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTRPC } from "../../../../../api/providers.tsx";
import { useSession } from "../../../../../api/session-gate.tsx";
import { useCommand } from "../../../../../api/use-command.ts";
import { CommandOutcome } from "../../../../../ui/patterns/command-outcome.tsx";
import { QueryStates } from "../../../../../ui/patterns/query-states.tsx";
import { Button } from "../../../../../ui/primitives/button.tsx";
import { INPUT_CLASS } from "../../../../../ui/primitives/field.tsx";
import { Select } from "../../../../../ui/primitives/select.tsx";

type EditableLine = {
  lineId: PurchaseLineId;
  productId: ProductId;
  productName: string;
  quantity: string;
  unit: Unit;
  price: string;
};

const emptyLine = (products: readonly { id: ProductId; displayName: string }[]): EditableLine => ({
  lineId: crypto.randomUUID() as PurchaseLineId,
  productId: products[0]?.id ?? ("" as ProductId),
  productName: products[0]?.displayName ?? "",
  quantity: "1",
  unit: "kg",
  price: "",
});

export default function EditPurchasePage() {
  const purchaseId = useParams<{ purchaseId: string }>().purchaseId as PurchaseId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const purchase = useQuery(trpc.purchase.get.queryOptions({ workspaceId, purchaseId }));
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  if (!session.permissions.includes("purchase.update"))
    return <p role="alert">Bạn không có quyền sửa đơn mua.</p>;
  return (
    <QueryStates
      query={purchase}
      loadingLabel="Đang tải đơn mua"
      onRetry={() => void purchase.refetch()}
    >
      {(draft) =>
        draft.status !== "draft" ? (
          <p role="alert">Chỉ đơn mua nháp mới có thể sửa.</p>
        ) : (
          <PurchaseDraftEditor
            purchase={draft}
            products={products.data?.items ?? []}
            productsLoading={products.isPending}
          />
        )
      }
    </QueryStates>
  );
}

function PurchaseDraftEditor(props: {
  purchase: PurchaseDto;
  products: readonly {
    id: ProductId;
    displayName: string;
    preferredUnit: Unit | null;
  }[];
  productsLoading: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const mutation = useMutation(trpc.purchase.updateDraft.mutationOptions());
  const update = useCommand<unknown, PurchaseDto>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  const [supplierId] = useState(props.purchase.supplierId as SupplierId);
  const [note, setNote] = useState(props.purchase.note ?? "");
  const [lines, setLines] = useState<readonly EditableLine[]>(() =>
    props.purchase.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      quantity: String(line.quantity.valueScaled / 1000),
      unit: line.quantity.unit,
      price: String(line.unitPrice.amountMinor / 1000),
    })),
  );
  useEffect(() => {
    if (update.result !== null) router.replace(`/purchases/${update.result.id}`);
  }, [router, update.result]);
  const payloadLines = lines.map((line) => ({
    lineId: line.lineId,
    productId: line.productId,
    productName: line.productName.trim(),
    quantity: { valueScaled: Math.round(Number(line.quantity) * 1000), unit: line.unit },
    unitPrice: {
      amountMinor: Math.round(Number(line.price) * 1000),
      currency: "VND" as const,
    },
  }));
  const valid =
    payloadLines.length > 0 &&
    payloadLines.every(
      (line) =>
        line.productId !== "" &&
        line.productName.length > 0 &&
        line.quantity.valueScaled > 0 &&
        Number.isSafeInteger(line.quantity.valueScaled) &&
        line.unitPrice.amountMinor >= 0 &&
        Number.isSafeInteger(line.unitPrice.amountMinor),
    );
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <h1 className="text-heading font-bold">Sửa đơn mua nháp</h1>
      <p className="text-caption text-ink-muted">
        Nhà cung cấp không đổi trong lần sửa này. Tạo đơn khác nếu chọn sai nhà cung cấp.
      </p>
      {lines.map((line, index) => (
        <fieldset
          key={line.lineId}
          className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-5"
        >
          <legend className="px-2 font-semibold">Dòng {index + 1}</legend>
          <Select
            label="Mặt hàng"
            value={line.productId}
            disabled={props.productsLoading}
            onChange={(event) => {
              const product = props.products.find((item) => item.id === event.target.value);
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
            options={props.products.map((product) => ({
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
      <Button
        tone="secondary"
        disabled={props.products.length === 0}
        onClick={() => setLines((current) => [...current, emptyLine(props.products)])}
      >
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
      <Button
        disabled={!valid || update.phase.kind === "sending"}
        onClick={() =>
          void update.submit(
            {
              purchaseId: props.purchase.id,
              supplierId,
              currency: props.purchase.currency,
              lines: payloadLines,
              note: note.trim() || null,
              dueAt: props.purchase.dueAt,
              replacesPurchaseId: props.purchase.replacesPurchaseId,
            },
            { expectedVersion: props.purchase.version },
          )
        }
      >
        Lưu thay đổi
      </Button>
      <CommandOutcome
        command={update}
        attemptedAction="Sửa đơn mua"
        onReload={() => router.refresh()}
      />
      <Link href={`/purchases/${props.purchase.id}`} className="text-info underline">
        ← Chi tiết đơn mua
      </Link>
    </div>
  );
}
