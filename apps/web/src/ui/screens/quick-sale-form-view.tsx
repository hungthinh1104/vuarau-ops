"use client";

import dynamic from "next/dynamic";
import { formatDate } from "@/ui/format.ts";
import { BalancePreview } from "@/ui/patterns/finance/balance-preview.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
const ProductPicker = dynamic(
  () => import("@/ui/patterns/sale/product-picker.tsx").then((module) => module.ProductPicker),
  { ssr: false },
);
import {
  QuickSaleGradeState,
  QuickSaleUnresolvedProduct,
} from "@/ui/patterns/sale/quick-sale-blockers.tsx";
import { QuickSaleFooter } from "@/ui/patterns/sale/quick-sale-footer.tsx";
import { QuickSaleLinesSection } from "@/ui/patterns/sale/quick-sale-lines-section.tsx";
import { TransactionPreview } from "@/ui/patterns/sale/transaction-preview.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Dialog } from "@/ui/primitives/dialog.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { QuickSaleView } from "@/ui/screens/quick-sale-view.tsx";
import type { QuickSaleFormModel } from "@/ui/controllers/quick-sale-form-model.ts";
import { useQuickSaleFormInteractions } from "@/ui/controllers/quick-sale-form-interactions.ts";

export function QuickSaleFormView(model: QuickSaleFormModel) {
  const {
    advanceFromLine,
    changeLine,
    closeProductPicker,
    confirmOpen,
    draftState,
    effectiveCustomer,
    handleConfirmedPost,
    openProductPicker,
    pickerOpen,
    postLocked,
    posting,
    productCreateLocked,
    setConfirmOpen,
  } = useQuickSaleFormInteractions(model);
  const {
    activeLine,
    activeLineId,
    addLine,
    cacheFetchedAt,
    cachedCatalogFetchedAt,
    capture,
    createActiveProduct,
    customer,
    customerId,
    discard,
    draft,
    draftCommand,
    editLines,
    evidence,
    lines,
    locallyQueued,
    fulfilmentReady,
    mayCreate,
    mayCreateProduct,
    mayPost,
    metrics,
    note,
    pendingCustomerCreate,
    postCommand,
    productCreateCommand,
    priceResolution,
    applyResolvedPrice,
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
    setEvidence,
    setNote,
    submitted,
    total,
    unitNotice,
    visibleProducts,
  } = model;

  return (
    <QueryStates
      query={effectiveCustomer}
      loadingLabel="Đang tải khách hàng"
      attemptedAction="Xem khách hàng"
      onRetry={() => void customer.refetch()}
    >
      {(detail) => (
        <QuickSaleView
          customerId={customerId}
          draftState={draftState}
          contextNotices={
            <>
              {locallyQueued ? (
                <section
                  role="status"
                  className="rounded-card border border-warning/40 bg-warning-soft px-3 py-3 text-body-sm"
                >
                  <p className="font-semibold">Đơn đã được lưu an toàn trên thiết bị.</p>
                  <p>
                    Dữ liệu đang chờ máy chủ xác nhận và không thể sửa trong lúc đồng bộ. Hãy dùng
                    recovery hiện tại thay vì tạo một lệnh mới.
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
                    <p className="border-l-2 border-warning pl-3 text-body-sm text-ink">
                      Đang tạo đơn thay thế cho đơn {source.id.slice(0, 8).toUpperCase()}. Đây là
                      giao dịch mới; kiểm tra lại toàn bộ dữ liệu trước khi chốt.
                    </p>
                  )}
                </QueryStates>
              ) : null}
              {cacheFetchedAt !== null && customer.data === undefined ? (
                <p
                  role="status"
                  className="border-l-2 border-warning pl-3 text-body-sm text-ink-muted"
                >
                  Đang dùng thông tin khách đã lưu lúc {formatDate(cacheFetchedAt)}. Số dư chỉ là
                  thông tin cũ và không được dùng để quyết định giao dịch.
                </p>
              ) : null}
              {pendingCustomerCreate !== null ? (
                <p
                  role="status"
                  className="border-l-2 border-warning pl-3 text-body-sm text-ink-muted"
                >
                  Khách mới đang lưu trên thiết bị. Khi chốt đơn, hệ thống đồng bộ khách trước rồi
                  mới tạo và chốt đơn.
                </p>
              ) : null}
            </>
          }
          customerSection={
            <>
              <section className="border-y border-border py-3">
                <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
                  Khách hàng
                </p>
                <p className="mt-1 text-subheading font-semibold text-ink">
                  {detail.customer.displayName}
                </p>
                {detail.customer.phone === null ? null : (
                  <p className="text-caption text-ink-muted">{detail.customer.phone}</p>
                )}
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
            </>
          }
          linesSection={
            <QuickSaleLinesSection
              lines={lines}
              resolved={resolved}
              submitted={submitted}
              serverLineIndex={serverLineIndex}
              disabled={locallyQueued}
              qualityGradeOptions={qualityGradeOptions}
              activeLineId={activeLineId}
              priceResolution={priceResolution}
              onApplyPriceRule={applyResolvedPrice}
              onFocusLine={setActiveLineId}
              onOpenProductPicker={openProductPicker}
              onChangeLine={changeLine}
              onRemoveLine={(index) =>
                editLines((current) => current.filter((_, at) => at !== index))
              }
              onAdvance={advanceFromLine}
            />
          }
          operationalNotices={
            <>
              {unitNotice === null ? null : (
                <p role="status" className="text-caption text-warning">
                  {unitNotice}
                </p>
              )}
              {cachedCatalogFetchedAt === null ? null : (
                <p role="status" className="text-caption text-warning">
                  Danh mục đang dùng bản lưu lúc {formatDate(cachedCatalogFetchedAt)}; kiểm tra lại
                  khi có mạng.
                </p>
              )}
              <QuickSaleGradeState
                loading={qualityGrades.isPending}
                error={qualityGrades.isError}
                gradeCount={qualityGradeOptions.length}
              />
            </>
          }
          productResolution={
            <>
              {noProductMatch ? (
                <QuickSaleUnresolvedProduct
                  productName={activeLine.productName}
                  mayCreateProduct={mayCreateProduct}
                  locked={locallyQueued || productCreateLocked}
                  creating={productCreateCommand.phase.kind === "sending"}
                  onCreate={() => void createActiveProduct()}
                />
              ) : null}
              <CommandOutcome
                command={productCreateCommand}
                attemptedAction="Tạo mặt hàng trong đơn"
                onReload={() => window.location.reload()}
              />
              <Button tone="secondary" fullWidth onClick={addLine} disabled={locallyQueued}>
                + Thêm dòng
              </Button>
            </>
          }
          noteSection={
            <>
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
              <Textarea
                label="Nguồn chứng cứ vận hành (mỗi dòng một tham chiếu)"
                hint="Ví dụ: order://..., photo://..., note://... — chỉ lưu liên kết nguồn, không tự tạo hiệu ứng tiền/hàng."
                rows={3}
                disabled={locallyQueued}
                value={evidence}
                onChange={(event) => {
                  setEvidence(event.target.value);
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
            </>
          }
          total={total}
          balanceSection={
            total.amountMinor > 0 && pendingCustomerCreate === null ? (
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
            ) : undefined
          }
          outcomes={
            <>
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
            </>
          }
          picker={
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
                              ...(line.priceOrigin?.kind === "rule"
                                ? { unitPriceText: "", priceOrigin: null }
                                : {}),
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
                              priceOrigin: { kind: "recalled", sourceSaleId, productName, unit },
                            }
                          : line,
                      ),
                    );
                    metrics.count("historical_price_applied");
                  }}
                />
              )}
            </QueryStates>
          }
          confirmation={
            confirmOpen ? (
              <Dialog
                open
                title="Xác nhận chốt đơn"
                onClose={() => setConfirmOpen(false)}
                actions={
                  <>
                    <Button tone="secondary" onClick={() => setConfirmOpen(false)}>
                      Quay lại
                    </Button>
                    <Button
                      onClick={() => void handleConfirmedPost()}
                      {...(posting || postLocked
                        ? { disabledReason: "Đang gửi hoặc chờ xác nhận lệnh trước." }
                        : {})}
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
            ) : undefined
          }
          footer={
            <QuickSaleFooter
              total={total}
              draftExists={draft !== null}
              locallyQueued={locallyQueued}
              replacementPending={replacementPending}
              mayPost={mayPost}
              fulfilmentReady={fulfilmentReady}
              commandLocked={postLocked}
              posted={postCommand.phase.kind === "succeeded"}
              onDiscard={() => void discard()}
              onSaveDraft={() => void saveDraft()}
              onConfirm={() => setConfirmOpen(true)}
            />
          }
        />
      )}
    </QueryStates>
  );
}
