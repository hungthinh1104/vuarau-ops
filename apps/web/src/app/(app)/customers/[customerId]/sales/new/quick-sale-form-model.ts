"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CustomerDetailDto,
  CustomerId,
  Money,
  ProductId,
  ProductDto,
  QualityGradeId,
  SaleDto,
} from "@vuarau/domain-contracts";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { hasPermission } from "@/api/session.ts";
import { useWorkflowMetrics } from "@/api/workflow-metrics.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import { useOffline } from "@/offline/provider.tsx";
import type { CachedProduct, CachedQualityGrade } from "@/offline/types.ts";
import { emptyLine, resolveLine } from "@/ui/patterns/sale/sale-line-editor.tsx";
import type { SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";
import { replacementDraftFrom } from "@/ui/patterns/sale/replacement-sale-draft.ts";

export function useQuickSaleFormModel(props: { readonly customerIdOverride?: CustomerId }) {
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
  const [cachedQualityGrades, setCachedQualityGrades] = useState<readonly CachedQualityGrade[]>([]);

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

  const [pickerProductQuery, setPickerProductQuery] = useState<string | null>(null);
  const activeProductQuery = useDebounced(pickerProductQuery ?? activeLine.productName, 200);

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
      limit: pickerProductQuery === null ? 8 : 12,
    }),
  );
  const qualityGrades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );

  useEffect(() => {
    if (qualityGrades.data === undefined) return;
    const fetchedAt = new Date().toISOString();
    const rows = qualityGrades.data.items.map((grade) => ({
      ...offline.partition,
      qualityGradeId: grade.id,
      name: grade.name,
      sortOrder: grade.sortOrder,
      fetchedAt,
    }));
    setCachedQualityGrades(rows);
    void offline.cacheQualityGrades(rows);
  }, [offline, qualityGrades.data]);

  useEffect(() => {
    if (qualityGrades.data !== undefined) return;
    void offline.cachedQualityGrades().then(setCachedQualityGrades);
  }, [offline, qualityGrades.data]);

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
  const createProductMutation = useMutation(trpc.product.create.mutationOptions());

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
  const productCreateCommand = useCommand<
    {
      productId: string;
      displayName: string;
      aliases: readonly string[];
      preferredUnit: SaleLineDraft["unit"];
    },
    ProductDto
  >(async (envelope) => (await createProductMutation.mutateAsync(envelope as never)) as ProductDto);
  const pendingProductRef = useRef<{
    readonly context: string;
    readonly productId: string;
  } | null>(null);

  const resolved = lines.map(resolveLine);

  const allValid = resolved.every((line) => line.total !== null);
  const fulfilmentReady = lines.every(
    (line) =>
      line.productId !== null &&
      line.productId !== undefined &&
      line.qualityGradeId !== null &&
      line.qualityGradeId !== undefined &&
      line.qualityGradeName !== null &&
      line.qualityGradeName !== undefined,
  );
  const qualityGradeOptions = (
    qualityGrades.data?.items ??
    [...cachedQualityGrades]
      .sort(
        (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
      )
      .map((grade) => ({
        id: grade.qualityGradeId as QualityGradeId,
        name: grade.name,
      }))
  ).map((grade) => ({
    value: grade.id,
    label: grade.name,
  }));
  const noProductMatch = activeLine.productName.trim().length > 0 && activeLine.productId == null;
  const mayCreateProduct = hasPermission(session, "product.create");

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

  function editLines(
    next:
      readonly SaleLineDraft[] | ((current: readonly SaleLineDraft[]) => readonly SaleLineDraft[]),
  ): void {
    setLines((current) => (typeof next === "function" ? next(current) : next));
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

  async function createActiveProduct(): Promise<void> {
    const displayName = activeLine.productName.trim();
    if (!mayCreateProduct || displayName.length === 0 || locallyQueued) return;
    const context = `${activeLine.lineId}\u0000${displayName}\u0000${activeLine.unit}`;
    if (pendingProductRef.current?.context !== context) {
      pendingProductRef.current = { context, productId: crypto.randomUUID() };
      productCreateCommand.reset();
    }
    const created = await productCreateCommand.submit({
      productId: pendingProductRef.current.productId,
      displayName,
      aliases: [],
      preferredUnit: activeLine.unit,
    });
    if (created === null) return;
    editLines((current) =>
      current.map((line) =>
        line.lineId === activeLine.lineId
          ? {
              ...line,
              productId: created.id,
              productName: created.displayName,
              unit: created.preferredUnit ?? line.unit,
            }
          : line,
      ),
    );
    metrics.count("product_created_inline");
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
        qualityGradeId: (line.qualityGradeId ?? null) as QualityGradeId | null,
        qualityGradeName: line.qualityGradeName ?? null,
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
    if (!allValid || !fulfilmentReady) {
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
  return {
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
    productSearchLoading: productSuggestions.isFetching || capture.isFetching,
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
  };
}

export type QuickSaleFormModel = ReturnType<typeof useQuickSaleFormModel>;

/** `SALE_LINE_INVALID` carries `lineIndex`, so the message can find its row. */
function readLineIndex(details: Record<string, unknown> | null): number | null {
  const value = details?.["lineIndex"];
  return typeof value === "number" ? value : null;
}
