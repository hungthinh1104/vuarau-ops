"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerId, Money, SaleDto } from "@vuarau/domain-contracts";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../../../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../../../api/providers.tsx";
import { useCommand } from "../../../../../../api/use-command.ts";
import { hasPermission } from "../../../../../../api/session.ts";
import { useWorkflowMetrics } from "../../../../../../api/workflow-metrics.ts";
import { useDebounced } from "../../../../../../api/use-debounced.ts";
import { QueryStates } from "../../../../../../ui/patterns/query-states.tsx";
import { BalancePreview } from "../../../../../../ui/patterns/balance-preview.tsx";
import { CommandOutcome } from "../../../../../../ui/patterns/command-outcome.tsx";
import { PermissionDenied } from "../../../../../../ui/patterns/permission-denied.tsx";
import {
  SaleLineEditor,
  emptyLine,
  resolveLine,
  type SaleLineDraft,
} from "../../../../../../ui/patterns/sale-line-editor.tsx";
import { replacementDraftFrom } from "../../../../../../ui/patterns/replacement-sale-draft.ts";
import { Badge } from "../../../../../../ui/primitives/badge.tsx";
import { Button } from "../../../../../../ui/primitives/button.tsx";
import { Textarea } from "../../../../../../ui/primitives/textarea.tsx";
import { formatDate, formatMoney } from "../../../../../../ui/format.ts";

/**
 * The quick sale — the workflow this milestone exists to put in front of a
 * worker.
 *
 * Three decisions shape it, all from the product brief:
 *
 * **Lines are local until they are saved.** A depot's connection drops, and a
 * round trip per line would make entry as slow as the connection. The draft is
 * written when the worker asks for it, or on the way to posting.
 *
 * **A draft says, in words, that nobody owes anything yet.** BR-SALE-010 is that
 * a draft has no account effect, and the screen has to make that legible: the
 * most expensive misunderstanding available here is thinking a customer has been
 * charged when they have not, or the reverse.
 *
 * **Adding a line never submits.** Every control is `type="button"`; there is no
 * form element to submit. On a phone with a numeric keypad, "Enter" is one
 * mis-tap away from posting a sale.
 */
export default function NewSalePage() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId as CustomerId;
  const replacesSaleId = searchParams.get("replacesSaleId");
  const metrics = useWorkflowMetrics();

  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const replacementSource = useQuery({
    ...trpc.sale.get.queryOptions({
      workspaceId,
      saleId: replacesSaleId as SaleDto["id"],
    }),
    enabled: replacesSaleId !== null,
  });
  const [lines, setLines] = useState<readonly SaleLineDraft[]>(() => [
    emptyLine(crypto.randomUUID()),
  ]);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<SaleDto | null>(null);
  const [dirty, setDirty] = useState(true);
  const [unitNotice, setUnitNotice] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const activeLine = lines.find((line) => line.lineId === activeLineId) ?? lines[0]!;
  const activeProductQuery = useDebounced(activeLine.productName, 200);
  const capture = useQuery(
    trpc.sale.captureContext.queryOptions({
      workspaceId,
      customerId,
      query: activeProductQuery,
      limit: 10,
    }),
  );

  // The sale's identity is minted once, when the screen opens. A draft saved,
  // edited and saved again is the same sale throughout.
  const saleIdRef = useRef(crypto.randomUUID());
  const startedRef = useRef(false);
  const offeredForRef = useRef<string | null>(null);
  const replacementSeededRef = useRef(false);
  const replacementPending =
    replacesSaleId !== null && (!replacementSource.isSuccess || !replacementSeededRef.current);

  useEffect(() => {
    if (
      replacesSaleId === null ||
      replacementSource.data === undefined ||
      replacementSeededRef.current
    )
      return;
    replacementSeededRef.current = true;
    const replacement = replacementDraftFrom(replacementSource.data, () => crypto.randomUUID());
    setLines(replacement.lines);
    setNote(replacement.note);
    setActiveLineId(replacement.lines[0]?.lineId ?? null);
  }, [customerId, replacesSaleId, replacementSource.data]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    metrics.mark("draft_started_at");
  }, [metrics]);

  useEffect(() => {
    const key = `${activeLine.lineId}\u0000${activeLine.productName}\u0000${activeLine.unit}`;
    if (
      capture.data === undefined ||
      capture.data.customerHistory.length === 0 ||
      offeredForRef.current === key
    )
      return;
    offeredForRef.current = key;
    metrics.count("historical_price_offered");
  }, [activeLine.lineId, activeLine.productName, activeLine.unit, capture.data, metrics]);

  const createDraft = useMutation(trpc.sale.createDraft.mutationOptions());
  const updateDraft = useMutation(trpc.sale.updateDraft.mutationOptions());
  const discardDraft = useMutation(trpc.sale.discardDraft.mutationOptions());
  const postSale = useMutation(trpc.sale.post.mutationOptions());

  const draftRef = useRef<SaleDto | null>(null);
  draftRef.current = draft;

  const draftCommand = useCommand<unknown, SaleDto>(async (envelope) =>
    draftRef.current === null
      ? ((await createDraft.mutateAsync(envelope as never)) as SaleDto)
      : ((await updateDraft.mutateAsync(envelope as never)) as SaleDto),
  );
  const postCommand = useCommand<{ saleId: string }, SaleDto>(
    async (envelope) => (await postSale.mutateAsync(envelope as never)) as SaleDto,
  );
  const discardCommand = useCommand<{ saleId: string; reason: string | null }, SaleDto>(
    async (envelope) => (await discardDraft.mutateAsync(envelope as never)) as SaleDto,
  );

  const resolved = lines.map(resolveLine);
  const allValid = resolved.every((line) => line.total !== null);
  const total: Money = {
    amountMinor: resolved.reduce((sum, line) => sum + (line.total?.amountMinor ?? 0), 0),
    currency: "VND",
  };

  // A correction replacement is authorized by sale.void; ordinary quick sales
  // keep their narrower create/post permissions.
  const isReplacement = replacesSaleId !== null;
  const mayCreate =
    hasPermission(session, "sale.create") || (isReplacement && hasPermission(session, "sale.void"));
  const mayPost =
    hasPermission(session, "sale.post") || (isReplacement && hasPermission(session, "sale.void"));

  /** The row the server refused, if it named one. */
  const serverLineIndex = readLineIndex(
    draftCommand.error?.details ?? postCommand.error?.details ?? null,
  );

  function editLines(next: readonly SaleLineDraft[]): void {
    setLines(next);
    setDirty(true);
    // Editing after a successful save is a new intention, and `useCommand`
    // refuses a second submit until it is reset.
    draftCommand.reset();
    metrics.count("line_edit_count");
  }

  function addLine(): void {
    const line = emptyLine(crypto.randomUUID());
    editLines([...lines, line]);
    setActiveLineId(line.lineId);
  }

  function toPayload() {
    return {
      saleId: saleIdRef.current,
      ...(draftRef.current === null ? { customerId, currency: "VND" as const } : {}),
      lines: lines.map((line, index) => ({
        lineId: line.lineId,
        /*
         * `null`, because the worker typed a name rather than picking a
         * catalogue entry. `productName` is the identity of what was sold
         * (BR-SALE-011); `productId` is a link to a suggestion, and there is no
         * product master to link to yet (BR-SALE-019).
         *
         * Minting a uuid here would create a foreign key to a product that does
         * not exist, which is how this was discovered.
         */
        productId: null,
        productName: line.productName.trim(),
        quantity: resolved[index]!.quantity,
        unitPrice: resolved[index]!.unitPrice,
      })),
      note: note.trim().length === 0 ? null : note.trim(),
      dueAt: null,
      ...(draftRef.current === null
        ? { replacesSaleId: replacesSaleId as SaleDto["id"] | null }
        : {}),
    };
  }

  async function saveDraft(): Promise<SaleDto | null> {
    if (replacementPending) return null;
    setSubmitted(true);
    if (!allValid) {
      metrics.count("validation_error_count");
      return null;
    }
    if (!dirty && draftRef.current !== null) return draftRef.current;

    draftCommand.reset();
    const saved = await draftCommand.submit(
      toPayload(),
      draftRef.current === null ? {} : { expectedVersion: draftRef.current.version },
    );
    if (saved !== null) {
      setDraft(saved);
      setDirty(false);
    }
    return saved;
  }

  useEffect(() => {
    if (postCommand.phase.kind === "succeeded" && postCommand.result !== null) {
      metrics.mark("post_confirmed_at");
      metrics.set("sale_line_count", lines.length);
      router.replace(`/sales/${postCommand.result.id}`);
    }
  }, [postCommand.phase.kind, postCommand.result, router, metrics, lines.length]);

  useEffect(() => {
    if (postCommand.phase.kind === "unknown") metrics.count("unknown_outcome_count");
  }, [postCommand.phase.kind, metrics]);

  async function post(): Promise<void> {
    if (replacementPending) return;
    setSubmitted(true);
    if (!allValid) {
      metrics.count("validation_error_count");
      return;
    }
    metrics.mark("post_attempted_at");

    /*
     * One tap does both: a draft has to exist before it can be posted, and asking
     * a worker to press "Lưu nháp" and then "Chốt đơn" would be asking them to
     * understand a storage detail.
     *
     * Two commands, each with its own identity. If the save lands and the post is
     * dropped, resending the post is safe; if the save is dropped, nothing was
     * posted. Neither half can half-happen.
     */
    const saved = draftRef.current !== null && !dirty ? draftRef.current : await saveDraft();
    // The save was refused or dropped. Its own outcome notice says which, and the
    // lines are still on screen.
    if (saved === null) return;

    await postCommand.submit({ saleId: saleIdRef.current }, { expectedVersion: saved.version });
  }

  async function discard(): Promise<void> {
    if (draftRef.current === null) {
      router.push(`/customers/${customerId}`);
      return;
    }
    await discardCommand.submit(
      { saleId: saleIdRef.current, reason: null },
      { expectedVersion: draftRef.current.version },
    );
    metrics.set("workflow_abandoned", 1);
    router.push(`/customers/${customerId}`);
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-heading font-bold">Đơn hàng mới</h1>
        {/* The state, said in words rather than implied by a colour. Until the
            sale is posted no debt exists (BR-SALE-010). */}
        <Badge tone={draft === null || dirty ? "neutral" : "info"}>
          {draft === null ? "Chưa lưu" : dirty ? "Có thay đổi chưa lưu" : "Đã lưu nháp"}
        </Badge>
      </div>

      <p className="rounded-card border border-info/30 bg-info-soft px-3 py-2 text-body-sm text-info">
        Đơn nháp <strong>chưa tính vào công nợ</strong>. Công nợ chỉ phát sinh khi bấm “Chốt đơn”.
      </p>

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

      <QueryStates
        query={customer}
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
                          return { ...next, unitPriceText: "", priceOrigin: null };
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
                        return next;
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
            <Button tone="secondary" fullWidth onClick={addLine}>
              + Thêm dòng
            </Button>

            <Textarea
              label="Ghi chú"
              rows={2}
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

            {total.amountMinor > 0 ? (
              <BalancePreview
                currentBalance={detail.balance}
                currentClassification={detail.classification}
                change={total}
                changeLabel="Đơn này"
              />
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
                <Button tone="secondary" onClick={() => void discard()}>
                  {draft === null ? "Huỷ" : "Bỏ đơn"}
                </Button>
                <Button
                  tone="secondary"
                  onClick={() => void saveDraft()}
                  {...(replacementPending ? { disabledReason: "Đang tải đơn cần thay thế…" } : {})}
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

/** `SALE_LINE_INVALID` carries `lineIndex`, so the message can find its row. */
function readLineIndex(details: Record<string, unknown> | null): number | null {
  const value = details?.["lineIndex"];
  return typeof value === "number" ? value : null;
}
