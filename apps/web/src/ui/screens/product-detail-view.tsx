"use client";

import type { ProductCoverageDto, ProductDto, Unit } from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  DetailLayout,
  PageFrame,
  PageHeader,
  SummaryRail,
} from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { formatQuantity } from "@/ui/format.ts";
import { formatCoverageAvailability } from "@/ui/domain/product-coverage.ts";

export type ProductDetailViewProps = {
  readonly query: QueryLike<ProductDto>;
  readonly coverageQuery: QueryLike<readonly ProductCoverageDto[]>;
  readonly coverage: ProductCoverageDto | undefined;
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
  readonly onRetryCoverage: () => void;
};

export function ProductDetailView(props: ProductDetailViewProps) {
  return (
    <QueryStates query={props.query} loadingLabel="Đang tải mặt hàng" onRetry={props.onRetry}>
      {(product) => (
        <PageFrame size="standard">
          <DetailLayout
            aside={
              <SummaryRail title="Mặt hàng">
                <Badge tone={product.isActive ? "positive" : "neutral"}>
                  {product.isActive ? "Đang dùng" : "Đã ngưng"}
                </Badge>
                <QueryStates
                  query={props.coverageQuery}
                  loadingLabel="Đang đối chiếu số lượng"
                  onRetry={props.onRetryCoverage}
                >
                  {() => <ProductCoverageSummary coverage={props.coverage} />}
                </QueryStates>
                <Link
                  href={`/products/${product.id}/inventory`}
                  className="font-semibold text-info underline-offset-4 hover:underline"
                >
                  Mở hàng hóa & kho
                </Link>
              </SummaryRail>
            }
          >
            <div className="flex max-w-xl flex-col gap-6">
              <PageHeader
                title={product.displayName}
                description={
                  product.preferredUnit === null
                    ? "Chưa chọn đơn vị ưu tiên"
                    : `Đơn vị ưu tiên: ${UNIT_LABEL_VI[product.preferredUnit]}`
                }
                back={{ href: "/products", label: "Hàng hóa & kho" }}
              />
              <TextInput
                label="Tên mặt hàng"
                value={props.name}
                onChange={(event) => props.onName(event.target.value)}
              />
              <TextInput
                label="Tên gọi khác"
                value={props.aliases}
                onChange={(event) => props.onAliases(event.target.value)}
              />
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
          </DetailLayout>
        </PageFrame>
      )}
    </QueryStates>
  );
}

function ProductCoverageSummary({
  coverage,
}: {
  readonly coverage: ProductCoverageDto | undefined;
}) {
  if (coverage === undefined || coverage.quantities.length === 0) {
    return <p className="text-body-sm text-ink-muted">Chưa có số liệu kho hoặc đơn đã chốt.</p>;
  }
  return (
    <div className="grid gap-2 border-y border-border py-3">
      {coverage.quantities.map((quantity) => (
        <div key={quantity.unit} className="grid gap-0.5 text-body-sm">
          <span>Tồn thực tế: {formatQuantity(quantity.onHand)}</span>
          <span>Đang mua: {formatQuantity(quantity.inboundRemaining)}</span>
          <span>Cần giao: {formatQuantity(quantity.outboundRemaining)}</span>
          <strong className={quantity.classification === "shortage" ? "text-danger" : undefined}>
            Sau đơn đã chốt: {formatCoverageAvailability(quantity)}
          </strong>
        </div>
      ))}
    </div>
  );
}
