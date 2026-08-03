"use client";

import type { ProductDto, Unit } from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";

export type ProductCreateViewProps = {
  readonly name: string;
  readonly aliases: string;
  readonly unit: Unit | "";
  readonly candidates: readonly ProductDto[] | undefined;
  readonly command: CommandOutcomeView;
  readonly onName: (value: string) => void;
  readonly onAliases: (value: string) => void;
  readonly onUnit: (value: Unit | "") => void;
  readonly onCreate: () => void;
};

export function ProductCreateView(props: ProductCreateViewProps) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Thêm mặt hàng" back={{ href: "/products", label: "Hủy" }} />
      <label className="text-label">
        Tên mặt hàng
        <Input value={props.name} onChange={(event) => props.onName(event.target.value)} />
      </label>
      {props.name.trim().length > 0 && (props.candidates?.length ?? 0) > 0 ? (
        <section className="rounded-card border border-warning/40 bg-warning-soft p-3">
          <h2 className="text-label font-semibold">Tên gần giống đã có</h2>
          <ul className="mt-2 flex flex-col gap-1 text-body-sm">
            {props.candidates?.map((product) => (
              <li key={product.id}>
                <Link href={`/products/${product.id}`} className="text-info underline">
                  {product.displayName}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption">
            Kiểm tra trước khi tạo. Hệ thống không tự gộp hai mặt hàng.
          </p>
        </section>
      ) : null}
      <label className="text-label">
        Tên gọi khác
        <Input
          value={props.aliases}
          onChange={(event) => props.onAliases(event.target.value)}
          placeholder="Phân cách bằng dấu phẩy"
        />
      </label>
      <Select
        label="Đơn vị gợi ý"
        value={props.unit}
        onChange={(event) => props.onUnit(event.target.value as Unit | "")}
        placeholder="Không chọn"
        options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
      />
      <Button
        disabled={props.name.trim().length === 0 || props.command.phase.kind === "sending"}
        onClick={props.onCreate}
      >
        Tạo mặt hàng
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Tạo mặt hàng"
        onReload={() => undefined}
      />
    </div>
  );
}
