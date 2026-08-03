"use client";

import type { ProductDto, Unit } from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";

export type ProductDetailViewProps = {
  readonly query: QueryLike<ProductDto>;
  readonly mayUpdate: boolean;
  readonly mayDeactivate: boolean;
  readonly name: string;
  readonly aliases: string;
  readonly unit: Unit | "";
  readonly update: CommandOutcomeView;
  readonly lifecycle: CommandOutcomeView;
  readonly onName: (value: string) => void;
  readonly onAliases: (value: string) => void;
  readonly onUnit: (value: Unit | "") => void;
  readonly onUpdate: () => void;
  readonly onLifecycle: () => void;
  readonly onRetry: () => void;
};

export function ProductDetailView(props: ProductDetailViewProps) {
  return (
    <QueryStates query={props.query} loadingLabel="Đang tải mặt hàng" onRetry={props.onRetry}>
      {(product) => (
        <div className="flex max-w-xl flex-col gap-6">
          <PageHeader
            title={product.displayName}
            description={
              product.preferredUnit === null
                ? "Chưa chọn đơn vị ưu tiên"
                : `Đơn vị ưu tiên: ${UNIT_LABEL_VI[product.preferredUnit]}`
            }
            back={{ href: "/products", label: "Danh mục mặt hàng" }}
            status={
              <Badge tone={product.isActive ? "positive" : "neutral"}>
                {product.isActive ? "Đang dùng" : "Đã ngưng"}
              </Badge>
            }
          />
          <Link
            href={`/products/${product.id}/inventory`}
            className="font-semibold text-info underline-offset-4 hover:underline"
          >
            Xem tồn kho và biến động vật lý
          </Link>
          <label className="text-label">
            Tên mặt hàng
            <Input value={props.name} onChange={(event) => props.onName(event.target.value)} />
          </label>
          <label className="text-label">
            Tên gọi khác
            <Input
              value={props.aliases}
              onChange={(event) => props.onAliases(event.target.value)}
            />
          </label>
          <Select
            label="Đơn vị gợi ý"
            value={props.unit}
            onChange={(event) => props.onUnit(event.target.value as Unit | "")}
            placeholder="Không chọn"
            options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
          />
          {props.mayUpdate ? (
            <Button onClick={props.onUpdate} disabled={props.update.phase.kind === "sending"}>
              Cập nhật mặt hàng
            </Button>
          ) : null}
          {props.mayDeactivate ? (
            <div className="border-t border-border pt-4">
              <Button
                tone={product.isActive ? "danger" : "secondary"}
                onClick={props.onLifecycle}
                disabled={props.lifecycle.phase.kind === "sending"}
              >
                {product.isActive ? "Ngưng mặt hàng" : "Dùng lại mặt hàng"}
              </Button>
            </div>
          ) : null}
          <CommandOutcome
            command={props.update}
            attemptedAction="Cập nhật mặt hàng"
            onReload={props.onRetry}
          />
          <CommandOutcome
            command={props.lifecycle}
            attemptedAction="Đổi trạng thái mặt hàng"
            onReload={props.onRetry}
          />
        </div>
      )}
    </QueryStates>
  );
}
