"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProductDto, ProductId, Unit } from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { useCommand } from "../../../../api/use-command.ts";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { CommandOutcome } from "../../../../ui/patterns/command-outcome.tsx";
import { Button } from "../../../../ui/primitives/button.tsx";
import { Select } from "../../../../ui/primitives/select.tsx";
import { INPUT_CLASS } from "../../../../ui/primitives/field.tsx";

export default function ProductDetailPage() {
  const { workspaceId, session } = useSession();
  const productId = useParams<{ productId: string }>().productId as ProductId;
  const trpc = useTRPC();
  const product = useQuery(trpc.product.get.queryOptions({ workspaceId, productId }));
  const refresh = useCallback(() => {
    void product.refetch();
  }, [product.refetch]);
  return (
    <QueryStates
      query={product}
      loadingLabel="Đang tải mặt hàng"
      onRetry={() => void product.refetch()}
    >
      {(detail) => (
        <ProductEditor
          product={detail}
          mayUpdate={session.permissions.includes("product.update")}
          mayDeactivate={session.permissions.includes("product.deactivate")}
          onChanged={refresh}
        />
      )}
    </QueryStates>
  );
}

function ProductEditor(props: {
  product: ProductDto;
  mayUpdate: boolean;
  mayDeactivate: boolean;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const [name, setName] = useState(props.product.displayName);
  const [aliases, setAliases] = useState(props.product.aliases.join(", "));
  const [unit, setUnit] = useState<Unit | "">(props.product.preferredUnit ?? "");
  useEffect(() => {
    setName(props.product.displayName);
    setAliases(props.product.aliases.join(", "));
    setUnit(props.product.preferredUnit ?? "");
  }, [props.product]);
  const updateMutation = useMutation(trpc.product.update.mutationOptions());
  const deactivateMutation = useMutation(trpc.product.deactivate.mutationOptions());
  const reactivateMutation = useMutation(trpc.product.reactivate.mutationOptions());
  const update = useCommand<unknown, ProductDto>((envelope) =>
    updateMutation.mutateAsync(envelope as never),
  );
  const lifecycle = useCommand<unknown, ProductDto>((envelope) =>
    props.product.isActive
      ? deactivateMutation.mutateAsync(envelope as never)
      : reactivateMutation.mutateAsync(envelope as never),
  );
  useEffect(() => {
    if (update.result !== null || lifecycle.result !== null) props.onChanged();
  }, [lifecycle.result, props.onChanged, update.result]);
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-heading font-bold">Mặt hàng</h1>
      <p className="text-caption text-ink-muted">
        Mã {props.product.id.slice(0, 8).toUpperCase()} · phiên bản {props.product.version}
      </p>
      <label className="text-label">
        Tên mặt hàng
        <input
          className={INPUT_CLASS}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="text-label">
        Tên gọi khác
        <input
          className={INPUT_CLASS}
          value={aliases}
          onChange={(event) => setAliases(event.target.value)}
        />
      </label>
      <Select
        label="Đơn vị gợi ý"
        value={unit}
        onChange={(event) => setUnit(event.target.value as Unit | "")}
        placeholder="Không chọn"
        options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
      />
      {props.mayUpdate ? (
        <Button
          onClick={() =>
            void update.submit(
              {
                productId: props.product.id,
                displayName: name,
                aliases: aliases
                  .split(",")
                  .map((alias) => alias.trim())
                  .filter(Boolean),
                preferredUnit: unit || null,
              },
              { expectedVersion: props.product.version },
            )
          }
        >
          Lưu thay đổi
        </Button>
      ) : null}
      {props.mayDeactivate ? (
        <Button
          tone="secondary"
          onClick={() =>
            void lifecycle.submit(
              {
                productId: props.product.id,
                reason: props.product.isActive ? "Ngưng sử dụng" : "Sử dụng lại",
              },
              { expectedVersion: props.product.version },
            )
          }
        >
          {props.product.isActive ? "Ngưng mặt hàng" : "Dùng lại mặt hàng"}
        </Button>
      ) : null}
      <CommandOutcome
        command={update}
        attemptedAction="Cập nhật mặt hàng"
        onReload={props.onChanged}
      />
      <CommandOutcome
        command={lifecycle}
        attemptedAction="Đổi trạng thái mặt hàng"
        onReload={props.onChanged}
      />
    </div>
  );
}
