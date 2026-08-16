"use client";

import type { BalanceClassification, Money, Quantity } from "@vuarau/domain-contracts";
import { describeBalance, formatQuantity, formatSignedMoney } from "@/ui/format.ts";

export type MoneyEffect = {
  readonly currentBalance: Money;
  readonly currentClassification: BalanceClassification;
  readonly change: Money;
  readonly changeLabel: string;
  readonly resultingBalance: Money;
  readonly resultingClassification: BalanceClassification;
};

export type InventoryEffect = {
  readonly productName: string;
  readonly gradeName?: string | null | undefined;
  readonly currentQuantity: Quantity;
  readonly changeQuantity: Quantity;
  readonly changeLabel: string;
  readonly resultingQuantity: Quantity;
};

export type EffectPreviewProps = {
  readonly title?: string | undefined;
  readonly entity?: {
    readonly label: string;
    readonly name: string;
  } | undefined;
  readonly moneyEffect?: MoneyEffect | undefined;
  readonly inventoryEffect?: InventoryEffect | undefined;
  readonly advisory?: string | undefined;
  readonly className?: string | undefined;
};

/**
 * Universal consequence preview for operational transactions.
 * Shows what will change across Money and/or Goods before the user commits.
 */
export function EffectPreview({
  title = "Hệ quả giao dịch dự kiến",
  entity,
  moneyEffect,
  inventoryEffect,
  advisory = "Số dự kiến. Số chính thức sẽ hiện sau khi máy chủ xác nhận.",
  className = "",
}: EffectPreviewProps) {
  return (
    <div
      className={["rounded-card border border-border bg-surface p-4", className]
        .filter(Boolean)
        .join(" ")}
    >
      <h3 className="text-body-sm font-semibold text-ink">{title}</h3>

      {entity !== undefined ? (
        <p className="mt-1 text-caption text-ink-muted">
          {entity.label}: <strong className="font-semibold text-ink">{entity.name}</strong>
        </p>
      ) : null}

      <div className="mt-3 grid gap-3">
        {moneyEffect !== undefined ? <MoneyEffectSection effect={moneyEffect} /> : null}

        {inventoryEffect !== undefined ? (
          <InventoryEffectSection effect={inventoryEffect} />
        ) : null}
      </div>

      {advisory ? (
        <p className="mt-3 border-t border-border pt-2 text-caption text-ink-muted">{advisory}</p>
      ) : null}
    </div>
  );
}

function MoneyEffectSection({ effect }: { readonly effect: MoneyEffect }) {
  const before = describeBalance(effect.currentBalance, effect.currentClassification);
  const after = describeBalance(effect.resultingBalance, effect.resultingClassification);

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-card bg-surface-muted px-3 py-2 text-body-sm">
      <dt className="text-ink-muted">{before.label} hiện tại</dt>
      <dd className="tabular text-right text-ink">{before.amount ?? "0 ₫"}</dd>

      <dt className="text-ink-muted">{effect.changeLabel}</dt>
      <dd
        className={`tabular text-right font-medium ${
          effect.change.amountMinor < 0 ? "text-leaf" : "text-ink"
        }`}
      >
        {formatSignedMoney(effect.change)}
      </dd>

      <dt className="border-t border-border pt-1.5 font-semibold text-ink">
        {after.label} sau giao dịch
      </dt>
      <dd className="tabular border-t border-border pt-1.5 text-right font-bold text-ink">
        {after.amount ?? "0 ₫"}
      </dd>
    </dl>
  );
}

function InventoryEffectSection({ effect }: { readonly effect: InventoryEffect }) {
  const beforeText = formatQuantity(effect.currentQuantity);
  const afterText = formatQuantity(effect.resultingQuantity);
  const isDecrease = effect.changeQuantity.valueScaled < 0;

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-card bg-surface-muted px-3 py-2 text-body-sm">
      <dt className="text-ink-muted">
        {effect.productName}
        {effect.gradeName ? ` · ${effect.gradeName}` : ""} (Tồn hiện tại)
      </dt>
      <dd className="tabular text-right text-ink">{beforeText}</dd>

      <dt className="text-ink-muted">{effect.changeLabel}</dt>
      <dd
        className={`tabular text-right font-medium ${
          isDecrease ? "text-danger" : "text-leaf"
        }`}
      >
        {isDecrease ? "−" : "+"}
        {formatQuantity({
          valueScaled: Math.abs(effect.changeQuantity.valueScaled),
          unit: effect.changeQuantity.unit,
        })}
      </dd>

      <dt className="border-t border-border pt-1.5 font-semibold text-ink">Tồn sau điều chỉnh</dt>
      <dd className="tabular border-t border-border pt-1.5 text-right font-bold text-ink">
        {afterText}
      </dd>
    </dl>
  );
}
