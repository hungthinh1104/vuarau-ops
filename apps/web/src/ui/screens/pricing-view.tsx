"use client";

import type {
  CustomerSummaryDto,
  Page,
  PriceRuleDto,
  PriceRuleKind,
  ProductDto,
  QualityGradeDto,
  Unit,
} from "@vuarau/domain-contracts";
import { PRICE_RULE_KINDS, UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatDate, formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { parseMoneyText } from "@/ui/domain/numeric-text.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

const KIND_COPY: Readonly<Record<PriceRuleKind, string>> = {
  list: "Giá niêm yết",
  customer: "Giá riêng khách hàng",
  override: "Giá thay thế",
};

export type PricingViewProps = {
  readonly rules: QueryLike<Page<PriceRuleDto>>;
  readonly items: readonly PriceRuleDto[];
  readonly nextCursor: string | null;
  readonly isFetching: boolean;
  readonly products: readonly ProductDto[];
  readonly customers: readonly CustomerSummaryDto[];
  readonly grades: readonly QualityGradeDto[];
  readonly mayManage: boolean;
  readonly productSearch: string;
  readonly customerSearch: string;
  readonly productId: string;
  readonly qualityGradeId: string;
  readonly customerId: string;
  readonly kind: PriceRuleKind;
  readonly unit: Unit;
  readonly priority: string;
  readonly minimumQuantity: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly basePrice: string;
  readonly discount: string;
  readonly fee: string;
  readonly reason: string;
  readonly formError: string | null;
  readonly command: CommandOutcomeView;
  readonly onProductSearch: (value: string) => void;
  readonly onCustomerSearch: (value: string) => void;
  readonly onProductId: (value: string) => void;
  readonly onQualityGradeId: (value: string) => void;
  readonly onCustomerId: (value: string) => void;
  readonly onKind: (value: PriceRuleKind) => void;
  readonly onUnit: (value: Unit) => void;
  readonly onPriority: (value: string) => void;
  readonly onMinimumQuantity: (value: string) => void;
  readonly onEffectiveFrom: (value: string) => void;
  readonly onEffectiveTo: (value: string) => void;
  readonly onBasePrice: (value: string) => void;
  readonly onDiscount: (value: string) => void;
  readonly onFee: (value: string) => void;
  readonly onReason: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly onReload: () => Promise<void>;
};

export function PricingView(props: PricingViewProps) {
  const productNames = new Map(props.products.map((product) => [product.id, product.displayName]));
  const customerNames = new Map(
    props.customers.map((customer) => [customer.id, customer.displayName]),
  );
  const gradeNames = new Map(props.grades.map((grade) => [grade.id, grade.name]));
  const productOptions = props.products.map((product) => ({
    value: product.id,
    label: `${product.displayName}${product.isActive ? "" : " · đã ngưng"}`,
  }));
  const customerOptions = props.customers.map((customer) => ({
    value: customer.id,
    label: `${customer.displayName}${customer.isActive ? "" : " · đã ngưng"}`,
  }));
  const gradeOptions = props.grades.map((grade) => ({ value: grade.id, label: grade.name }));

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Bảng giá"
        description="Các quy tắc giá chính xác đã ghi. Mỗi quy tắc được giữ nguyên; giá trên đơn đã chốt không bị thay đổi theo bảng này."
      />
      <p className="rounded-card border border-info/30 bg-info-soft px-4 py-3 text-body-sm">
        Thứ tự ưu tiên, chiết khấu, phí vận hành và ngưỡng số lượng đang chờ xác nhận thực địa. Màn
        hình không tự tính biên lợi nhuận, không đổi đơn vị và không tự sửa giá đơn đã chốt.
      </p>

      {props.mayManage ? (
        <PriceRuleForm
          {...props}
          productOptions={productOptions}
          customerOptions={customerOptions}
          gradeOptions={gradeOptions}
        />
      ) : null}

      <section aria-labelledby="pricing-history-title" className="grid gap-3">
        <div>
          <h2 id="pricing-history-title" className="text-subheading font-semibold">
            Lịch sử quy tắc giá
          </h2>
          <p className="text-caption text-ink-muted">
            Hiển thị theo thời điểm hiệu lực; không có thao tác sửa hoặc xoá.
          </p>
        </div>
        <QueryStates query={props.rules} loadingLabel="Đang tải bảng giá" onRetry={props.onRetry}>
          {() =>
            props.items.length === 0 ? (
              <EmptyState
                title="Chưa có quy tắc giá"
                description="Ghi quy tắc đầu tiên khi vựa đã thống nhất cách áp dụng giá."
              />
            ) : (
              <>
                <ul className="grid gap-3 lg:hidden">
                  {props.items.map((rule) => (
                    <PriceRuleCard
                      key={rule.id}
                      rule={rule}
                      productName={productNames.get(rule.productId)}
                      customerName={
                        rule.customerId === null ? undefined : customerNames.get(rule.customerId)
                      }
                      gradeName={
                        rule.qualityGradeId === null
                          ? undefined
                          : gradeNames.get(rule.qualityGradeId)
                      }
                    />
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-card border border-border bg-surface shadow-sm lg:block">
                  <table className="data-table w-full min-w-[1050px] table-fixed text-left text-body-sm">
                    <caption className="sr-only">Lịch sử quy tắc giá</caption>
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[17%]" />
                      <col className="w-[12%]" />
                      <col className="w-[15%]" />
                      <col className="w-[12%]" />
                      <col className="w-[16%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th scope="col" className="px-3 py-3">
                          Mặt hàng
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Phạm vi
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Đơn vị / ngưỡng
                        </th>
                        <th scope="col" className="px-3 py-3 text-right">
                          Giá cuối
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Hiệu lực
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Lý do
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Ghi nhận
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {props.items.map((rule) => (
                        <PriceRuleRow
                          key={rule.id}
                          rule={rule}
                          productName={productNames.get(rule.productId)}
                          customerName={
                            rule.customerId === null
                              ? undefined
                              : customerNames.get(rule.customerId)
                          }
                          gradeName={
                            rule.qualityGradeId === null
                              ? undefined
                              : gradeNames.get(rule.qualityGradeId)
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          }
        </QueryStates>
        {props.nextCursor === null ? null : (
          <LoadMoreFooter
            visibleCount={props.items.length}
            noun="quy tắc giá"
            loading={props.isFetching}
            onLoadMore={props.onLoadMore}
          />
        )}
      </section>
    </div>
  );
}

function PriceRuleForm(
  props: PricingViewProps & {
    readonly productOptions: readonly { readonly value: string; readonly label: string }[];
    readonly customerOptions: readonly { readonly value: string; readonly label: string }[];
    readonly gradeOptions: readonly { readonly value: string; readonly label: string }[];
  },
) {
  const basePreview = parseMoneyText(props.basePrice, "VND");
  const discountPreview = parseMoneyText(props.discount, "VND");
  const feePreview = parseMoneyText(props.fee, "VND");
  const preview =
    basePreview.ok &&
    discountPreview.ok &&
    feePreview.ok &&
    basePreview.value !== null &&
    discountPreview.value !== null &&
    feePreview.value !== null
      ? formatMoney({
          amountMinor:
            basePreview.value.amountMinor -
            discountPreview.value.amountMinor +
            feePreview.value.amountMinor,
          currency: "VND",
        })
      : "—";

  return (
    <section
      aria-labelledby="pricing-record-title"
      className="grid gap-4 rounded-panel border border-border bg-surface p-4"
    >
      <div>
        <h2 id="pricing-record-title" className="text-subheading font-semibold">
          Ghi quy tắc giá
        </h2>
        <p className="text-caption text-ink-muted">
          Mỗi lần ghi tạo một quy tắc mới; không cập nhật quy tắc cũ.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SearchInput
          label="Tìm mặt hàng"
          value={props.productSearch}
          onChange={(event) => props.onProductSearch(event.target.value)}
          onClear={() => props.onProductSearch("")}
          placeholder="Tên hoặc tên gọi khác"
        />
        <Select
          label="Mặt hàng"
          required
          value={props.productId}
          onChange={(event) => props.onProductId(event.target.value)}
          placeholder="Chọn mặt hàng"
          options={props.productOptions}
        />
        <Select
          label="Loại quy tắc giá"
          value={props.kind}
          onChange={(event) => props.onKind(event.target.value as PriceRuleKind)}
          options={PRICE_RULE_KINDS.map((value) => ({ value, label: KIND_COPY[value] }))}
        />
        <Select
          label="Hạng hàng (tuỳ chọn)"
          value={props.qualityGradeId}
          onChange={(event) => props.onQualityGradeId(event.target.value)}
          placeholder="Tất cả hạng hàng"
          options={props.gradeOptions}
        />
        {props.kind === "customer" ? (
          <>
            <SearchInput
              label="Tìm khách hàng"
              value={props.customerSearch}
              onChange={(event) => props.onCustomerSearch(event.target.value)}
              onClear={() => props.onCustomerSearch("")}
              placeholder="Tên hoặc số điện thoại"
            />
            <Select
              label="Khách hàng"
              required
              value={props.customerId}
              onChange={(event) => props.onCustomerId(event.target.value)}
              placeholder="Chọn khách hàng"
              options={props.customerOptions}
            />
          </>
        ) : null}
        <Select
          label="Đơn vị"
          value={props.unit}
          onChange={(event) => props.onUnit(event.target.value as Unit)}
          options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
        />
        <TextInput
          label="Ngưỡng số lượng"
          hint={`Đơn vị ${UNIT_LABEL_VI[props.unit]}, tối đa 3 chữ số sau dấu phẩy`}
          inputMode="decimal"
          value={props.minimumQuantity}
          onChange={(event) => props.onMinimumQuantity(event.target.value)}
        />
        <TextInput
          label="Độ ưu tiên"
          hint="Số lớn hơn được ưu tiên khi các điều kiện khác khớp."
          inputMode="numeric"
          value={props.priority}
          onChange={(event) => props.onPriority(event.target.value)}
        />
        <TextInput
          label="Hiệu lực từ"
          type="datetime-local"
          value={props.effectiveFrom}
          onChange={(event) => props.onEffectiveFrom(event.target.value)}
          required
        />
        <TextInput
          label="Hiệu lực đến (tuỳ chọn)"
          type="datetime-local"
          value={props.effectiveTo}
          onChange={(event) => props.onEffectiveTo(event.target.value)}
        />
        <TextInput
          label="Giá cơ sở (VND)"
          hint="Nhập số nguyên, có thể dùng dấu chấm phân tách."
          inputMode="numeric"
          value={props.basePrice}
          onChange={(event) => props.onBasePrice(event.target.value)}
          required
        />
        <TextInput
          label="Giảm trên đơn vị (VND)"
          inputMode="numeric"
          value={props.discount}
          onChange={(event) => props.onDiscount(event.target.value)}
        />
        <TextInput
          label="Phí trên đơn vị (VND)"
          inputMode="numeric"
          value={props.fee}
          onChange={(event) => props.onFee(event.target.value)}
        />
        <div className="rounded-card border border-border bg-surface-muted p-3">
          <p className="text-caption text-ink-muted">Giá cuối dự kiến</p>
          <p className="text-subheading font-bold">{preview}</p>
          <p className="text-caption text-ink-muted">Hệ thống sẽ kiểm tra và không nhận giá âm.</p>
        </div>
      </div>
      <TextInput
        label={props.kind === "override" ? "Lý do thay thế" : "Lý do (tuỳ chọn)"}
        value={props.reason}
        onChange={(event) => props.onReason(event.target.value)}
        required={props.kind === "override"}
      />
      {props.formError === null ? null : (
        <p role="alert" className="rounded-input bg-danger-soft px-3 py-2 text-body-sm text-danger">
          {props.formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={props.command.phase.kind === "sending"} onClick={props.onSubmit}>
          {props.command.phase.kind === "sending" ? "Đang ghi quy tắc" : "Ghi quy tắc giá"}
        </Button>
        <CommandOutcome
          command={props.command}
          attemptedAction="Ghi quy tắc giá"
          onReload={() => void props.onReload()}
        />
      </div>
    </section>
  );
}

function scopeCopy(
  rule: PriceRuleDto,
  customerName: string | undefined,
  gradeName: string | undefined,
): ReactNode {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge tone="neutral">{KIND_COPY[rule.kind]}</Badge>
      <span>{gradeName ?? "Mọi hạng hàng"}</span>
      {rule.customerId === null ? null : (
        <span>· {customerName ?? `Mã ${shortId(rule.customerId)}`}</span>
      )}
    </span>
  );
}

function PriceRuleRow(props: {
  readonly rule: PriceRuleDto;
  readonly productName: string | undefined;
  readonly customerName: string | undefined;
  readonly gradeName: string | undefined;
}) {
  const { rule } = props;
  return (
    <tr>
      <th scope="row" className="px-3 py-3 align-top font-semibold">
        <span className="block truncate" title={props.productName ?? rule.productId}>
          {props.productName ?? `Mã ${shortId(rule.productId)}`}
        </span>
        <span className="block text-caption font-normal text-ink-muted">{shortId(rule.id)}</span>
      </th>
      <td className="px-3 py-3 align-top">
        {scopeCopy(rule, props.customerName, props.gradeName)}
      </td>
      <td className="px-3 py-3 align-top">
        {UNIT_LABEL_VI[rule.unit]} ·{" "}
        {formatQuantity({ valueScaled: rule.minimumQuantityScaled, unit: rule.unit })}
      </td>
      <td className="px-3 py-3 text-right align-top font-semibold">
        {formatMoney(rule.finalUnitPrice)}
        <span className="block text-caption font-normal text-ink-muted">
          Ưu tiên {rule.priority}
        </span>
      </td>
      <td className="px-3 py-3 align-top">
        {formatDate(rule.effectiveFrom)}
        {rule.effectiveTo === null ? " → không hạn" : ` → ${formatDate(rule.effectiveTo)}`}
      </td>
      <td className="px-3 py-3 align-top">{rule.reason ?? "—"}</td>
      <td className="px-3 py-3 align-top text-caption text-ink-muted">
        {formatInstant(rule.recordedAt)}
      </td>
    </tr>
  );
}

function PriceRuleCard(props: {
  readonly rule: PriceRuleDto;
  readonly productName: string | undefined;
  readonly customerName: string | undefined;
  readonly gradeName: string | undefined;
}) {
  const { rule } = props;
  return (
    <li className="grid gap-2 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong>{props.productName ?? `Mã ${shortId(rule.productId)}`}</strong>
          <p className="text-caption text-ink-muted">
            {scopeCopy(rule, props.customerName, props.gradeName)}
          </p>
        </div>
        <strong>{formatMoney(rule.finalUnitPrice)}</strong>
      </div>
      <p className="text-body-sm">
        {UNIT_LABEL_VI[rule.unit]} · từ {formatDate(rule.effectiveFrom)}
        {rule.effectiveTo === null ? "" : ` đến ${formatDate(rule.effectiveTo)}`} · ngưỡng{" "}
        {formatQuantity({ valueScaled: rule.minimumQuantityScaled, unit: rule.unit })}
      </p>
      <p className="text-caption text-ink-muted">
        {rule.reason ?? "Không có lý do"} · ưu tiên {rule.priority}
      </p>
    </li>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}
