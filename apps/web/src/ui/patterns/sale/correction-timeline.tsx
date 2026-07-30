import type { SaleDto } from "@vuarau/domain-contracts";
import Link from "next/link";

export type CorrectionTimelineProps = {
  readonly sale: SaleDto;
  readonly replacedBySaleId: string | null;
  readonly currentLabel: string;
  /** The source sale when this page is the replacement side of the chain. */
  readonly replacedSale?: SaleDto;
};

/**
 * A correction is not a mutation of the old sale. This deliberately renders
 * the three accounting events in their actual order, so both ends of a chain
 * explain why the balance changed.
 */
export function CorrectionTimeline({
  sale,
  replacedBySaleId,
  currentLabel,
  replacedSale,
}: CorrectionTimelineProps) {
  const source = replacedSale ?? sale;
  const sourceLabel =
    replacedSale === undefined ? currentLabel : `Mã đơn ${source.id.slice(0, 8).toUpperCase()}`;
  const replacementId = replacedBySaleId ?? (replacedSale === undefined ? null : sale.id);

  return (
    <ol className="mt-3 flex flex-col gap-2 border-l-2 border-border pl-4 text-body-sm">
      <li>
        {replacedSale === undefined ? (
          <span>+ Đơn gốc: {sourceLabel}</span>
        ) : (
          <Link href={`/sales/${source.id}`} className="text-info underline">
            + Đơn gốc: {sourceLabel}
          </Link>
        )}
      </li>
      {source.voidRecord !== null ? <li>− Void: {source.voidRecord.reason}</li> : null}
      {replacementId !== null ? (
        <li>
          {replacedSale === undefined ? (
            <Link href={`/sales/${replacementId}`} className="text-info underline">
              + Đơn thay thế
            </Link>
          ) : (
            <span>+ Đơn thay thế: {currentLabel}</span>
          )}
        </li>
      ) : null}
    </ol>
  );
}
