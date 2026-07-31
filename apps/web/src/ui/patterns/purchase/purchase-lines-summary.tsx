import type { PurchaseDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatMoney, formatQuantity } from "@/ui/format.ts";

export function PurchaseLinesSummary({
  purchase,
}: {
  readonly purchase: Pick<PurchaseDto, "lines" | "totalAmount">;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Hàng mua</h2>
      <ul className="divide-y divide-border">
        {purchase.lines.map((line) => (
          <li key={line.lineId} className="grid gap-1 py-3 md:grid-cols-3">
            <Link
              href={`/products/${line.productId}`}
              className="font-semibold text-info underline-offset-4 hover:underline"
            >
              {line.productName}
            </Link>
            <span>
              {formatQuantity(line.quantity)} × {formatMoney(line.unitPrice)}
            </span>
            <strong className="tabular md:text-right">{formatMoney(line.lineTotal)}</strong>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-body-sm font-semibold text-ink-muted">Tổng mua</span>
        <strong className="tabular text-heading text-ink">
          {formatMoney(purchase.totalAmount)}
        </strong>
      </div>
    </section>
  );
}
