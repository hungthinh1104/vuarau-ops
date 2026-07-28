"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CustomerDetailDto,
  CustomerId,
  Money,
  ProductId,
  SaleDto,
} from "@vuarau/domain-contracts";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../../../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../../../api/providers.tsx";
import { useCommand } from "../../../../../../api/use-command.ts";
import { hasPermission } from "../../../../../../api/session.ts";
import { useWorkflowMetrics } from "../../../../../../api/workflow-metrics.ts";
import { useDebounced } from "../../../../../../api/use-debounced.ts";
import { useOffline } from "../../../../../../offline/provider.tsx";
import type { CachedProduct } from "../../../../../../offline/types.ts";
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
  return <QuickSaleForm />;
}

export function QuickSaleForm(props: { readonly customerIdOverride?: CustomerId }) {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ customerId?: string }>();
  const customerId = (props.customerIdOverride ??
    params.customerId ??
    searchParams.get("customerId")) as CustomerId;
  const replacesSaleId = searchParams.get("replacesSaleId");
  const metrics = useWorkflowMetrics();
  const offline = useOffline();
  const loadOfflineDraft = offline.loadDraft;
  const saveOfflineDraft = offline.saveDraft;
  const [cachedCustomer, setCachedCustomer] = useState<CustomerDetailDto | null>(null);
  const [pendingCustomerCreate, setPendingCustomerCreate] = useState<{
    readonly customerId: string;
    readonly displayName: string;
    readonly phone: string | null;
    readonly note: string | null;
  } | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [cachedProducts, setCachedProducts] = useState<readonly CachedProduct[]>([]);

  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const replacementSource = useQuery({
    ...trpc.sale.get.queryOptions({
      workspaceId,
      saleId: replacesSaleId as SaleDto["id"],
    }),
    enabled: replacesSaleId !== null,
  });
  const localSaleId = searchParams.get("localSaleId") ?? crypto.randomUUID();
  const saleIdRef = useRef(localSaleId);
  const [lines, setLines] = useState<readonly SaleLineDraft[]>(() => [
    emptyLine(crypto.randomUUID()),
  ]);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<SaleDto | null>(null);
  const [dirty, setDirty] = useState(true);
  const [unitNotice, setUnitNotice] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [localHydrated, setLocalHydrated] = useState(false);
  const [locallyQueued, setLocallyQueued] = useState(false);
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
  const productSuggestions = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: activeProductQuery,
      isActive: true,
      cursor: null,
      limit: 8,
    }),
  );
  useEffect(() => {
    if (productSuggestions.data === undefined) return;
    const fetchedAt = new Date().toISOString();
    const rows = productSuggestions.data.items.map((product) => ({
      ...offline.partition,
      productId: product.id,
      displayName: product.displayName,
      aliases: product.aliases,
      preferredUnit: product.preferredUnit,
      fetchedAt,
    }));
    setCachedProducts(rows);
    void offline.cacheProducts(rows);
  }, [offline, productSuggestions.data]);
  useEffect(() => {
    if (productSuggestions.data !== undefined) return;
    void offline.cachedProducts().then(setCachedProducts);
  }, [offline, productSuggestions.data]);
  const visibleProducts =
    productSuggestions.data?.items ??
    cachedProducts
      .filter((product) => {
        const needle = activeProductQuery.toLocaleLowerCase("vi");
        return (
          product.displayName.toLocaleLowerCase("vi").includes(needle) ||
          product.aliases.some((alias) => alias.toLocaleLowerCase("vi").includes(needle))
        );
      })
      .map((product) => ({
        id: product.productId as ProductId,
        displayName: product.displayName,
        aliases: [...product.aliases],
        preferredUnit: product.preferredUnit as SaleLineDraft["unit"] | null,
      }));
  const cachedCatalogFetchedAt =
    productSuggestions.data === undefined
      ? (cachedProducts
          .map((product) => product.fetchedAt)
          .sort()
          .at(-1) ?? null)
      : null;

  // The sale's identity is minted once, when the screen opens. A draft saved,
  // edited and saved again is the same sale throughout.
  const startedRef = useRef(false);
  const queueingRef = useRef(false);
  const offeredForRef = useRef<string | null>(null);
  const replacementSeededRef = useRef(false);
  const replacementPending =
    replacesSaleId !== null && (!replacementSource.isSuccess || !replacementSeededRef.current);

  useEffect(() => {
    if (
      searchParams.has("localSaleId") ||
      new URLSearchParams(window.location.search).has("localSaleId")
    )
      return;
    const next = new URLSearchParams(searchParams.toString());
    if (props.customerIdOverride !== undefined) {
      next.set("offlineCustomerId", props.customerIdOverride);
    }
    next.set("localSaleId", saleIdRef.current);
    const url = `${pathname}?${next.toString()}`;
    if (props.customerIdOverride !== undefined) {
      window.history.replaceState(null, "", url);
    } else {
      router.replace(url);
    }
  }, [pathname, props.customerIdOverride, router, searchParams]);

  useEffect(() => {
    let active = true;
    void loadOfflineDraft(saleIdRef.current).then((saved) => {
      if (!active) return;
      if (saved !== null) {
        setLines(saved.lines as readonly SaleLineDraft[]);
        setNote(saved.note ?? "");
        setLocallyQueued(saved.syncState !== "local");
      }
      setLocalHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [loadOfflineDraft]);

  useEffect(() => {
    if (!localHydrated || locallyQueued) return;
    void saveOfflineDraft({
      saleId: saleIdRef.current,
      customerId,
      ...offline.partition,
      lines,
      note: note.trim().length === 0 ? null : note,
      occurredAt: new Date().toISOString(),
      syncState: "local",
      updatedAt: new Date().toISOString(),
    });
  }, [customerId, lines, localHydrated, locallyQueued, note, offline.partition, saveOfflineDraft]);

  useEffect(() => {
    if (customer.data === undefined) return;
    const fetchedAt = new Date().toISOString();
    void offline.cacheCustomers([
      {
        ...offline.partition,
        customerId,
        displayName: customer.data.customer.displayName,
        phone: customer.data.customer.phone,
        detail: customer.data,
        fetchedAt,
      },
    ]);
  }, [customer.data, customerId, offline]);

  useEffect(() => {
    if (customer.data !== undefined) return;
    let active = true;
    void offline.cachedCustomers().then((customers) => {
      const cached = customers.find((candidate) => candidate.customerId === customerId);
      if (!active || cached === undefined) return;
      setCachedCustomer(cached.detail);
      setCacheFetchedAt(cached.fetchedAt);
      setPendingCustomerCreate(cached.pendingCreate ?? null);
    });
    return () => {
      active = false;
    };
  }, [customer.data, customerId, offline]);

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
         * A catalog choice carries its real id; free text carries null.
         * `productName`, unit and price remain the immutable Sale snapshot
         * (BR-SALE-011 / ADR-0017). Never mint a product id for free text.
         */
        productId: line.productId ?? null,
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
    const post = offline.commands.find(
      (command) =>
        command.chainId === saleIdRef.current &&
        command.kind === "sale.post" &&
        command.state === "confirmed",
    );
    const result = post?.result as SaleDto | undefined;
    if (result?.id !== undefined) {
      metrics.mark("post_confirmed_at");
      router.replace(`/sales/${result.id}`);
    }
  }, [metrics, offline.commands, router]);

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

    if (
      draftRef.current === null &&
      replacesSaleId === null &&
      (!navigator.onLine || pendingCustomerCreate !== null)
    ) {
      if (queueingRef.current) return;
      queueingRef.current = true;
      try {
        await offline.queueSale({
          ...(pendingCustomerCreate === null ? {} : { customerCommand: pendingCustomerCreate }),
          sale: {
            saleId: saleIdRef.current,
            customerId,
            lines: toPayload().lines,
            note: note.trim().length === 0 ? null : note.trim(),
            replacesSaleId: null,
          },
          draftLines: lines,
          occurredAt: new Date().toISOString(),
        });
        setLocallyQueued(true);
        await offline.retry();
      } finally {
        queueingRef.current = false;
      }
      return;
    }

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

/** `SALE_LINE_INVALID` carries `lineIndex`, so the message can find its row. */
function readLineIndex(details: Record<string, unknown> | null): number | null {
  const value = details?.["lineIndex"];
  return typeof value === "number" ? value : null;
}
