"use client";

import Link from "next/link";
import { QueryStates } from "../../../../../../ui/patterns/query-states.tsx";
import { BalancePreview } from "../../../../../../ui/patterns/balance-preview.tsx";
import { CommandOutcome } from "../../../../../../ui/patterns/command-outcome.tsx";
import { PermissionDenied } from "../../../../../../ui/patterns/permission-denied.tsx";
import { SaleLineEditor } from "../../../../../../ui/patterns/sale-line-editor.tsx";
import type { SaleLineDraft } from "../../../../../../ui/patterns/sale-line-editor.tsx";
import { Badge } from "../../../../../../ui/primitives/badge.tsx";
import { Button } from "../../../../../../ui/primitives/button.tsx";
import { Textarea } from "../../../../../../ui/primitives/textarea.tsx";
import { formatDate, formatMoney } from "../../../../../../ui/format.ts";
import type { QuickSaleFormModel } from "./quick-sale-form-model.ts";

export function QuickSaleFormView(model: QuickSaleFormModel) {
  const {
    activeLine,
    addLine,
    cacheFetchedAt,
    cachedCatalogFetchedAt,
    cachedCustomer,
    capture,
    customer,
    customerId,
    dirty,
    discard,
    draft,
    draftCommand,
    editLines,
    lines,
    locallyQueued,
    mayCreate,
    mayPost,
    metrics,
    note,
    offline,
    pendingCustomerCreate,
    post,
    postCommand,
    replacementPending,
    replacementSource,
    replacesSaleId,
    resolved,
    saveDraft,
    serverLineIndex,
    session,
    setActiveLineId,
    setDirty,
    setNote,
    setUnitNotice,
    submitted,
    total,
    unitNotice,
    visibleProducts,
  } = model;
  return (
    <div className="flex flex-col gap-5 pb-28">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-heading font-bold">Đơn hàng mới</h1>
        {/* The state, said in words rather than implied by a colour. Until the
            sale is posted no debt exists (BR-SALE-010). */}
        <Badge tone={locallyQueued ? "warning" : draft === null || dirty ? "neutral" : "info"}>
          {locallyQueued
            ? offline.blockedCount > 0
              ? "Cần xử lý đồng bộ"
              : "Đã lưu trên thiết bị · chờ máy chủ"
            : draft === null
              ? "Chưa lưu"
              : dirty
                ? "Có thay đổi chưa lưu"
                : "Đã lưu nháp"}
        </Badge>
      </div>

      <p className="rounded-card border border-info/30 bg-info-soft px-3 py-2 text-body-sm text-info">
        Đơn nháp <strong>chưa tính vào công nợ</strong>. Công nợ chỉ phát sinh khi bấm “Chốt đơn”.
      </p>

      {locallyQueued ? (
        <section
          role="status"
          className="rounded-card border border-warning/40 bg-warning-soft px-3 py-3 text-body-sm"
        >
          <p className="font-semibold">Đơn đã được lưu an toàn trên thiết bị.</p>
          <p>
            Dữ liệu đang chờ máy chủ xác nhận và không thể sửa trong lúc đồng bộ. Bạn có thể thử
            đồng bộ từ trạng thái phía trên, rời màn hình hoặc tải lại trang.
          </p>
        </section>
      ) : null}

      {replacesSaleId !== null ? (
        <QueryStates
          query={replacementSource}
          loadingLabel="Đang tải đơn cần thay thế"
          attemptedAction="Tải đơn cần thay thế"
          onRetry={() => void replacementSource.refetch()}
        >
          {(source) => (
            <p className="rounded-card border border-warning/30 bg-warning-soft px-3 py-2 text-body-sm text-ink">
              Đang tạo đơn thay thế cho đơn {source.id.slice(0, 8).toUpperCase()}. Kiểm tra dữ liệu
              trước khi chốt; đơn này là một giao dịch mới.
            </p>
          )}
        </QueryStates>
      ) : null}

      {cacheFetchedAt !== null && customer.data === undefined ? (
        <p
          role="status"
          className="rounded-card border border-warning/30 bg-warning-soft px-3 py-2 text-body-sm"
        >
          Đang dùng thông tin khách đã lưu lúc {formatDate(cacheFetchedAt)}. Số dư chỉ là thông tin
          cũ và không được dùng để quyết định giao dịch.
        </p>
      ) : null}
      {pendingCustomerCreate !== null ? (
        <p
          role="status"
          className="rounded-card border border-warning/30 bg-warning-soft px-3 py-2 text-body-sm"
        >
          Khách mới đang lưu trên thiết bị. Khi chốt đơn, hệ thống sẽ đồng bộ khách trước rồi mới
          tạo và chốt Sale.
        </p>
      ) : null}

      <QueryStates
        query={
          cachedCustomer === null
            ? customer
            : ({
                ...customer,
                data: cachedCustomer,
                isPending: false,
                isError: false,
                error: null,
              } as typeof customer)
        }
        loadingLabel="Đang tải khách hàng"
        attemptedAction="Xem khách hàng"
        onRetry={() => void customer.refetch()}
      >
        {(detail) => (
          <>
            <section className="rounded-card border border-border bg-surface p-4">
              <p className="text-body font-medium text-ink">{detail.customer.displayName}</p>
              {detail.customer.phone !== null ? (
                <p className="text-caption text-ink-muted">{detail.customer.phone}</p>
              ) : null}
            </section>

            {!mayCreate ? (
              <PermissionDenied
                error={{
                  code: "PERMISSION_DENIED",
                  message: "Role does not carry permission 'sale.create'.",
                  details: { permission: "sale.create", role: session.role },
                  retryable: false,
                }}
                attemptedAction="Tạo đơn hàng"
              />
            ) : null}

            <ul className="flex flex-col gap-3">
              {lines.map((line, index) => (
                <SaleLineEditor
                  key={line.lineId}
                  line={line}
                  index={index}
                  issues={submitted ? resolved[index]!.issues : {}}
                  {...(serverLineIndex === index
                    ? { serverIssue: "Máy chủ từ chối dòng này. Kiểm tra số lượng và đơn giá." }
                    : {})}
                  canRemove={lines.length > 1}
                  disabled={locallyQueued}
                  onFocus={() => setActiveLineId(line.lineId)}
                  onChange={(next) =>
                    editLines(
                      lines.map((existing, at) => {
                        if (at !== index) return existing;
                        const recalled = existing.priceOrigin?.kind === "recalled";
                        const productChanged = existing.productName !== next.productName;
                        const unitChanged = existing.unit !== next.unit;
                        if (recalled && (productChanged || unitChanged)) {
                          setUnitNotice(
                            "Giá lần trước đã được xoá vì mặt hàng hoặc đơn vị thay đổi.",
                          );
                          metrics.count("recalled_price_cleared_after_context_change");
                          return {
                            ...next,
                            productId: productChanged ? null : (next.productId ?? null),
                            unitPriceText: "",
                            priceOrigin: null,
                          };
                        }
                        // Any edit to a recalled visible price is an intentional manual override.
                        if (existing.unitPriceText !== next.unitPriceText && recalled) {
                          metrics.count("historical_price_changed_after_apply");
                          return { ...next, priceOrigin: { kind: "manual" } };
                        }
                        if (
                          existing.unitPriceText !== next.unitPriceText &&
                          next.unitPriceText.length > 0
                        ) {
                          return { ...next, priceOrigin: { kind: "manual" } };
                        }
                        return productChanged ? { ...next, productId: null } : next;
                      }),
                    )
                  }
                  onRemove={() => editLines(lines.filter((_, at) => at !== index))}
                />
              ))}
            </ul>

            {unitNotice !== null ? (
              <p role="status" className="text-caption text-warning">
                {unitNotice}
              </p>
            ) : null}
            {cachedCatalogFetchedAt !== null ? (
              <p
                role="status"
                className="rounded-card border border-warning/30 bg-warning-soft px-3 py-2 text-body-sm"
              >
                Đang dùng danh mục đã lưu lúc {formatDate(cachedCatalogFetchedAt)}. Kiểm tra lại khi
                có mạng; tên và đơn vị này chỉ là gợi ý nhập liệu.
              </p>
            ) : null}
            {visibleProducts.length > 0 ? (
              <section className="rounded-card border border-border bg-surface p-3">
                <h2 className="text-label font-semibold">Danh mục mặt hàng</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {visibleProducts.map((product) => (
                    <Button
                      key={product.id}
                      tone="secondary"
                      disabled={locallyQueued}
                      onClick={() =>
                        editLines(
                          lines.map((line) =>
                            line.lineId === activeLine.lineId
                              ? {
                                  ...line,
                                  productId: product.id,
                                  productName: product.displayName,
                                  unit: product.preferredUnit ?? line.unit,
                                }
                              : line,
                          ),
                        )
                      }
                    >
                      {product.displayName}
                      {product.preferredUnit === null ? "" : ` · ${product.preferredUnit}`}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-caption text-ink-muted">
                  Chọn mặt hàng chỉ điền tên và đơn vị; đơn giá vẫn do bạn nhập hoặc chủ động dùng
                  giá lần trước.
                </p>
              </section>
            ) : null}
            <QueryStates
              query={capture}
              loadingLabel="Đang tải giá gần đây"
              attemptedAction="Xem giá gần đây"
            >
              {(context) =>
                context.customerHistory.length === 0 &&
                context.workspaceHistory.length === 0 ? null : (
                  <section className="rounded-card border border-border bg-surface p-3">
                    <h2 className="text-label font-semibold">Gần đây với khách này</h2>
                    {context.workspaceHistory.map((history) => (
                      <Button
                        key={`workspace-${history.productName}-${history.unit}`}
                        tone="secondary"
                        disabled={locallyQueued}
                        onClick={() => {
                          editLines(
                            lines.map((line) =>
                              line.lineId === activeLine.lineId
                                ? {
                                    ...line,
                                    productName: history.productName,
                                    unit: history.unit as SaleLineDraft["unit"],
                                  }
                                : line,
                            ),
                          );
                          metrics.count("historical_product_selected");
                        }}
                      >
                        {history.productName} · {history.unit}
                      </Button>
                    ))}
                    {context.customerHistory.map((history) => (
                      <div
                        key={`${history.productName}-${history.unit}`}
                        className="mt-2 flex items-center justify-between gap-2 text-body-sm"
                      >
                        <span>
                          {history.productName} · {history.unit}
                          <br />
                          <span className="text-caption text-ink-muted">
                            Giá lần trước: {formatMoney(history.lastUnitPrice)} ·{" "}
                            {formatDate(history.lastTransactionTime)}
                          </span>
                        </span>
                        {activeLine.productName.trim() === history.productName &&
                        activeLine.unit === history.unit ? (
                          <Button
                            tone="secondary"
                            disabled={locallyQueued}
                            onClick={() => {
                              editLines(
                                lines.map((line) =>
                                  line.lineId === activeLine.lineId
                                    ? {
                                        ...line,
                                        unitPriceText: String(history.lastUnitPrice.amountMinor),
                                        priceOrigin: {
                                          kind: "recalled",
                                          sourceSaleId: history.sourceSaleId,
                                          productName: history.productName,
                                          unit: history.unit as SaleLineDraft["unit"],
                                        },
                                      }
                                    : line,
                                ),
                              );
                              metrics.count("historical_price_applied");
                            }}
                          >
                            Dùng giá này
                          </Button>
                        ) : (
                          <Button
                            tone="secondary"
                            disabled={locallyQueued}
                            onClick={() => {
                              editLines(
                                lines.map((line) =>
                                  line.lineId === activeLine.lineId
                                    ? {
                                        ...line,
                                        productName: history.productName,
                                        unit: history.unit as SaleLineDraft["unit"],
                                      }
                                    : line,
                                ),
                              );
                              metrics.count("historical_product_selected");
                            }}
                          >
                            Chọn mặt hàng
                          </Button>
                        )}
                      </div>
                    ))}
                  </section>
                )
              }
            </QueryStates>

            {/* `type="button"`, like every control here: adding a line must never
                be one mis-tap away from posting a sale. */}
            <Button tone="secondary" fullWidth onClick={addLine} disabled={locallyQueued}>
              + Thêm dòng
            </Button>

            <Textarea
              label="Ghi chú"
              rows={2}
              disabled={locallyQueued}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setDirty(true);
              }}
            />

            <section className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-subheading font-semibold">Tổng đơn</span>
                <span className="tabular text-display font-bold" data-testid="sale-total">
                  {formatMoney(total)}
                </span>
              </div>
            </section>

            {total.amountMinor > 0 && pendingCustomerCreate === null ? (
              <BalancePreview
                currentBalance={detail.balance}
                currentClassification={detail.classification}
                change={total}
                changeLabel="Đơn này"
              />
            ) : pendingCustomerCreate !== null ? (
              <p className="text-caption text-ink-muted">
                Công nợ hiện tại chưa có trên máy chủ; ứng dụng không tự suy ra số dư.
              </p>
            ) : null}

            <CommandOutcome
              command={draftCommand}
              attemptedAction="Lưu đơn nháp"
              onReload={() => window.location.reload()}
            />
            <CommandOutcome
              command={postCommand}
              attemptedAction="Chốt đơn"
              onReload={() => window.location.reload()}
            />

            <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-3">
              <div className="mx-auto flex max-w-[1440px] gap-2">
                <Button
                  tone="secondary"
                  onClick={() => void discard()}
                  {...(locallyQueued ? { disabledReason: "Đơn đang chờ máy chủ xác nhận." } : {})}
                >
                  {draft === null ? "Huỷ" : "Bỏ đơn"}
                </Button>
                <Button
                  tone="secondary"
                  onClick={() => void saveDraft()}
                  {...(locallyQueued
                    ? { disabledReason: "Đơn đã được lưu an toàn trên thiết bị." }
                    : replacementPending
                      ? { disabledReason: "Đang tải đơn cần thay thế…" }
                      : {})}
                >
                  Lưu nháp
                </Button>
                <Button
                  fullWidth
                  onClick={() => void post()}
                  {...(!mayPost
                    ? { disabledReason: "Bạn không có quyền chốt đơn." }
                    : replacementPending
                      ? { disabledReason: "Đang tải đơn cần thay thế…" }
                      : locallyQueued
                        ? { disabledReason: "Đơn đã được lưu an toàn trên thiết bị." }
                        : postCommand.phase.kind === "sending" ||
                            draftCommand.phase.kind === "sending"
                          ? { disabledReason: "Đang gửi…" }
                          : postCommand.phase.kind === "succeeded"
                            ? { disabledReason: "Đã chốt." }
                            : {})}
                >
                  Chốt đơn
                </Button>
              </div>
            </div>

            <Link
              href={`/customers/${customerId}`}
              className="text-body-sm text-info underline underline-offset-2"
            >
              ← Quay lại khách hàng
            </Link>
          </>
        )}
      </QueryStates>
    </div>
  );
}
