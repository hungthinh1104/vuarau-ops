"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { BalancePreview } from "@/ui/patterns/finance/balance-preview.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { SaleLineEditor } from "@/ui/patterns/sale/sale-line-editor.tsx";
import { ProductPicker } from "@/ui/patterns/sale/product-picker.tsx";
import { TransactionPreview } from "@/ui/patterns/sale/transaction-preview.tsx";
import { Dialog } from "@/ui/primitives/dialog.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { formatDate, formatMoney } from "@/ui/format.ts";
import type { QuickSaleFormModel } from "./quick-sale-form-model.ts";

export function QuickSaleFormView(model: QuickSaleFormModel) {
  const {
    activeLine,
    addLine,
    cacheFetchedAt,
    cachedCatalogFetchedAt,
    cachedCustomer,
    capture,
    createActiveProduct,
    customer,
    customerId,
    dirty,
    discard,
    draft,
    draftCommand,
    editLines,
    lines,
    locallyQueued,
    fulfilmentReady,
    mayCreate,
    mayCreateProduct,
    mayPost,
    metrics,
    note,
    offline,
    pendingCustomerCreate,
    post,
    postCommand,
    productCreateCommand,
    productSearchLoading,
    noProductMatch,
    qualityGrades,
    qualityGradeOptions,
    replacementPending,
    replacementSource,
    replacesSaleId,
    resolved,
    saveDraft,
    serverLineIndex,
    session,
    setActiveLineId,
    setPickerProductQuery,
    setDirty,
    setNote,
    setUnitNotice,
    submitted,
    total,
    unitNotice,
    visibleProducts,
  } = model;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  function openProductPicker(): void {
    setPickerProductQuery("");
    setPickerOpen(true);
  }

  function closeProductPicker(): void {
    setPickerOpen(false);
    setPickerProductQuery(null);
  }

  // Show a success toast exactly once after a definitive server confirmation.
  // CommandOutcome stays authoritative for errors and unknown-network states.
  const toastedRef = useRef(false);
  useEffect(() => {
    if (postCommand.phase.kind === "succeeded" && !toastedRef.current) {
      toastedRef.current = true;
      toast.success("Đã chốt đơn thành công");
    }
  }, [postCommand.phase.kind]);

  async function handleConfirmedPost(): Promise<void> {
    setPosting(true);
    try {
      await post();
    } finally {
      setPosting(false);
      setConfirmOpen(false);
    }
  }

  function advanceFromLine(index: number): void {
    const line = lines[index];
    if (
      line === undefined ||
      resolved[index]?.total === null ||
      line.productId === null ||
      line.productId === undefined ||
      line.qualityGradeId === null ||
      line.qualityGradeId === undefined ||
      line.qualityGradeName === null ||
      line.qualityGradeName === undefined
    )
      return;
    const focusProductAt = (at: number) => {
      requestAnimationFrame(() => {
        const products = document.querySelectorAll<HTMLElement>("[data-sale-field='product']");
        products[at]?.focus();
      });
    };
    if (index < lines.length - 1) {
      focusProductAt(index + 1);
      return;
    }
    addLine();
    requestAnimationFrame(() => focusProductAt(index + 1));
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      <PageHeader
        title="Đơn hàng mới"
        back={{ href: `/customers/${customerId}`, label: "Khách hàng" }}
        status={
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
        }
      />

      <p className="text-body-sm text-info">
        Đơn nháp <strong>chưa tính vào công nợ</strong>; công nợ chỉ phát sinh khi chốt đơn.
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
          tạo và chốt đơn.
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
                  qualityGradeOptions={qualityGradeOptions}
                  onFocus={() => setActiveLineId(line.lineId)}
                  {...(!locallyQueued
                    ? {
                        onOpenProductPicker: () => {
                          setActiveLineId(line.lineId);
                          openProductPicker();
                        },
                      }
                    : {})}
                  onChange={(incoming, field) =>
                    editLines((current) =>
                      current.map((existing, at) => {
                        if (at !== index) return existing;
                        const next =
                          field === "product"
                            ? { ...existing, productName: incoming.productName }
                            : field === "qualityGrade"
                              ? {
                                  ...existing,
                                  qualityGradeId: incoming.qualityGradeId ?? null,
                                  qualityGradeName: incoming.qualityGradeName ?? null,
                                }
                              : field === "quantity"
                                ? { ...existing, quantityText: incoming.quantityText }
                                : field === "unit"
                                  ? { ...existing, unit: incoming.unit }
                                  : { ...existing, unitPriceText: incoming.unitPriceText };
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
                  onRemove={() => editLines((current) => current.filter((_, at) => at !== index))}
                  onAdvance={() => advanceFromLine(index)}
                />
              ))}
            </ul>

            {unitNotice !== null ? (
              <p role="status" className="text-caption text-warning">
                {unitNotice}
              </p>
            ) : null}
            {cachedCatalogFetchedAt !== null ? (
              <p role="status" className="text-caption text-warning">
                Danh mục đang dùng bản lưu lúc {formatDate(cachedCatalogFetchedAt)}; kiểm tra lại
                khi có mạng.
              </p>
            ) : null}
            {qualityGrades.isPending && qualityGradeOptions.length === 0 ? (
              <p role="status" className="text-caption text-ink-muted">
                Đang tải phân hạng chất lượng…
              </p>
            ) : qualityGrades.isError && qualityGradeOptions.length === 0 ? (
              <p role="alert" className="text-caption text-danger">
                Không tải được phân hạng chất lượng. Chưa thể chốt đơn.
              </p>
            ) : qualityGradeOptions.length === 0 ? (
              <p
                role="alert"
                className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
              >
                Vựa chưa cấu hình phân hạng chất lượng. Hãy nhờ chủ vựa hoặc kho cấu hình trước khi
                chốt đơn.
              </p>
            ) : null}

            {noProductMatch ? (
              <section
                role="status"
                className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
              >
                <p className="font-semibold">Mặt hàng chưa có trong danh mục</p>
                {mayCreateProduct ? (
                  <Button
                    className="mt-2"
                    tone="secondary"
                    disabled={locallyQueued || productCreateCommand.phase.kind === "sending"}
                    onClick={() => void createActiveProduct()}
                  >
                    {productCreateCommand.phase.kind === "sending"
                      ? "Đang tạo…"
                      : `Tạo mặt hàng "${activeLine.productName.trim()}"`}
                  </Button>
                ) : (
                  <p className="mt-1 text-ink-muted">
                    Bạn không có quyền tạo mặt hàng. Hãy chọn mặt hàng có sẵn hoặc nhờ chủ vựa.
                  </p>
                )}
              </section>
            ) : null}
            <CommandOutcome
              command={productCreateCommand}
              attemptedAction="Tạo mặt hàng trong đơn"
              onReload={() => window.location.reload()}
            />

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
            <Button
              tone="secondary"
              className="self-start sm:hidden"
              onClick={() => void discard()}
              {...(locallyQueued ? { disabledReason: "Đơn đang chờ máy chủ xác nhận." } : {})}
            >
              {draft === null ? "Huỷ đơn" : "Bỏ đơn"}
            </Button>

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

            {/*
             * ProductPicker Drawer — replaces the two inline catalog/history
             * sections. History context is still visible; historical price still
             * requires an explicit "Dùng giá này" tap inside the drawer.
             */}
            <QueryStates
              query={capture}
              loadingLabel="Đang tải giá gần đây"
              attemptedAction="Xem giá gần đây"
            >
              {(context) => (
                <ProductPicker
                  open={pickerOpen}
                  onClose={closeProductPicker}
                  onSearchChange={setPickerProductQuery}
                  searching={productSearchLoading}
                  visibleProducts={visibleProducts}
                  customerHistory={context.customerHistory}
                  workspaceHistory={context.workspaceHistory}
                  onSelectProduct={(productId, productName, unit) => {
                    editLines((current) =>
                      current.map((line) =>
                        line.lineId === activeLine.lineId
                          ? {
                              ...line,
                              productId: productId ?? null,
                              productName,
                              unit,
                            }
                          : line,
                      ),
                    );
                    metrics.count("historical_product_selected");
                  }}
                  onApplyHistoricalPrice={(
                    productId,
                    productName,
                    unit,
                    sourceSaleId,
                    lastUnitPrice,
                  ) => {
                    editLines((current) =>
                      current.map((line) =>
                        line.lineId === activeLine.lineId
                          ? {
                              ...line,
                              productId: productId ?? null,
                              productName,
                              unit,
                              unitPriceText: String(lastUnitPrice.amountMinor),
                              priceOrigin: {
                                kind: "recalled",
                                sourceSaleId,
                                productName,
                                unit,
                              },
                            }
                          : line,
                      ),
                    );
                    metrics.count("historical_price_applied");
                  }}
                />
              )}
            </QueryStates>

            {/*
             * Transaction confirmation dialog (P2.5).
             *
             * Opened when the worker taps "Chốt đơn". The dialog shows the
             * BalancePreview (existing component) so the debt consequence is
             * explicit before the command is sent. All existing posting guards
             * remain in `post()` — nothing here bypasses them.
             */}
            {confirmOpen ? (
              <Dialog
                open={confirmOpen}
                title="Xác nhận chốt đơn"
                onClose={() => setConfirmOpen(false)}
                actions={
                  <>
                    <Button tone="secondary" onClick={() => setConfirmOpen(false)}>
                      Quay lại
                    </Button>
                    <Button
                      onClick={() => void handleConfirmedPost()}
                      {...(posting ? { disabledReason: "Đang gửi…" } : {})}
                    >
                      Chốt đơn
                    </Button>
                  </>
                }
              >
                <TransactionPreview
                  customerName={detail.customer.displayName}
                  lines={lines}
                  resolved={resolved}
                  total={total}
                  currentBalance={pendingCustomerCreate === null ? detail.balance : null}
                  currentClassification={
                    pendingCustomerCreate === null ? detail.classification : null
                  }
                />
              </Dialog>
            ) : null}

            <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-surface/95 px-4 py-2.5 shadow-md backdrop-blur lg:bottom-0">
              <div className="mx-auto flex max-w-[1440px] items-center gap-2 lg:justify-end lg:pl-[312px] lg:pr-8">
                <div className="mr-auto min-w-0">
                  <p className="text-caption text-ink-muted">Tổng đơn</p>
                  <p className="tabular truncate text-subheading font-bold text-ink">
                    {formatMoney(total)}
                  </p>
                </div>
                <Button
                  tone="secondary"
                  className="hidden sm:inline-flex"
                  onClick={() => void discard()}
                  {...(locallyQueued ? { disabledReason: "Đơn đang chờ máy chủ xác nhận." } : {})}
                >
                  {draft === null ? "Huỷ" : "Bỏ đơn"}
                </Button>
                <Button
                  tone="secondary"
                  className="hidden sm:inline-flex"
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
                  tone="secondary"
                  className="sm:hidden"
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
                  className="min-w-32 sm:min-w-40"
                  onClick={() => setConfirmOpen(true)}
                  {...(!mayPost
                    ? { disabledReason: "Bạn không có quyền chốt đơn." }
                    : !fulfilmentReady
                      ? {
                          disabledReason:
                            "Chọn mặt hàng trong danh mục và phân hạng chất lượng cho mọi dòng.",
                        }
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
          </>
        )}
      </QueryStates>
    </div>
  );
}
