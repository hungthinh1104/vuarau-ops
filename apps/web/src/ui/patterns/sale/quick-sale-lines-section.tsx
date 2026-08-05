"use client";

import type { PriceResolutionDto } from "@vuarau/domain-contracts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import type { ResolvedLine, SaleLineDraft } from "./sale-line-editor.tsx";
import { SaleLineEditor } from "./sale-line-editor.tsx";

export type SaleLineField = "product" | "qualityGrade" | "quantity" | "unit" | "unitPrice";

export function QuickSaleLinesSection(props: {
  readonly lines: readonly SaleLineDraft[];
  readonly resolved: readonly ResolvedLine[];
  readonly submitted: boolean;
  readonly serverLineIndex: number | null;
  readonly disabled: boolean;
  readonly qualityGradeOptions: readonly { readonly value: string; readonly label: string }[];
  readonly qualityGradeRequired?: boolean;
  readonly activeLineId: string;
  readonly priceResolution?: QueryLike<PriceResolutionDto>;
  readonly onApplyPriceRule: () => void;
  readonly onFocusLine: (lineId: string) => void;
  readonly onOpenProductPicker: (lineId: string) => void;
  readonly onChangeLine: (index: number, incoming: SaleLineDraft, field: SaleLineField) => void;
  readonly onRemoveLine: (index: number) => void;
  readonly onAdvance: (index: number) => void;
}) {
  return (
    <section aria-labelledby="sale-lines-title" className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-label font-medium text-ink-muted">Giỏ hàng</p>
          <h2 id="sale-lines-title" className="mt-1 text-subheading font-semibold text-ink">
            Dòng hàng
          </h2>
        </div>
        <span className="tabular rounded-pill bg-surface-muted px-2.5 py-1 text-caption font-medium text-ink-muted">
          {props.lines.length} dòng
        </span>
      </div>
      <ul className="flex flex-col gap-4">
        {props.lines.map((line, index) => (
          <SaleLineEditor
            key={line.lineId}
            line={line}
            index={index}
            issues={props.submitted ? (props.resolved[index]?.issues ?? {}) : {}}
            {...(props.serverLineIndex === index
              ? { serverIssue: "Máy chủ chưa nhận được dòng này. Kiểm tra số lượng và đơn giá." }
              : {})}
            canRemove={props.lines.length > 1}
            disabled={props.disabled}
            qualityGradeOptions={props.qualityGradeOptions}
            qualityGradeRequired={props.qualityGradeRequired ?? true}
            {...(line.lineId === props.activeLineId
              ? {
                  priceResolution: props.priceResolution,
                  onApplyPriceRule: props.onApplyPriceRule,
                }
              : {})}
            onFocus={() => props.onFocusLine(line.lineId)}
            {...(!props.disabled
              ? { onOpenProductPicker: () => props.onOpenProductPicker(line.lineId) }
              : {})}
            onChange={(incoming, field) => props.onChangeLine(index, incoming, field)}
            onRemove={() => props.onRemoveLine(index)}
            onAdvance={() => props.onAdvance(index)}
          />
        ))}
      </ul>
    </section>
  );
}
