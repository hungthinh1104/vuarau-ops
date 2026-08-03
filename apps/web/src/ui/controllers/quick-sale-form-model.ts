"use client";

import { useQuery } from "@tanstack/react-query";
import {
  productIdSchema,
  type CustomerId,
  type Money,
  type ProductId,
  type SaleLineId,
  type SaleDto,
} from "@vuarau/domain-contracts";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { hasPermission } from "@/api/session.ts";
import { useWorkflowMetrics } from "@/api/workflow-metrics.ts";
import { useOffline } from "@/offline/provider.tsx";
import { emptyLine, resolveLine } from "@/ui/patterns/sale/sale-line-editor.tsx";
import type { SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";
import { replacementDraftFrom } from "@/ui/patterns/sale/replacement-sale-draft.ts";
import { useQuickSaleCatalog } from "@/ui/controllers/quick-sale-catalog.ts";
import { useQuickSaleCommands } from "@/ui/controllers/quick-sale-commands.ts";
import { useQuickSalePersistence } from "@/ui/controllers/quick-sale-persistence.ts";
import { buildQuickSalePayload } from "@/ui/controllers/quick-sale-payload.ts";
import { formatSourceEvidence, parseSourceEvidence } from "@/ui/domain/source-evidence.ts";

// This id is only used as the disabled-query input while a line is incomplete.
// The query is never enabled for it and no fake Product is written or displayed.
const DISABLED_PRICE_PRODUCT_ID = productIdSchema.parse("00000000-0000-4000-8000-000000000000");

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

  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));

  const replacementSource = useQuery({
    ...trpc.sale.get.queryOptions({
      workspaceId,
      saleId: replacesSaleId as SaleDto["id"],
    }),
    enabled: replacesSaleId !== null,
  });

  const localSaleId = searchParams.get("localSaleId") ?? crypto.randomUUID();

  const priceResolutionAsOfRef = useRef(new Date().toISOString());

  const saleIdRef = useRef<SaleDto["id"]>(localSaleId as SaleDto["id"]);

  const [lines, setLines] = useState<readonly SaleLineDraft[]>(() => [
    emptyLine(crypto.randomUUID() as SaleLineId),
  ]);

  const [note, setNote] = useState("");

  const [evidence, setEvidence] = useState("");

  const [submitted, setSubmitted] = useState(false);

  const [draft, setDraft] = useState<SaleDto | null>(null);

  const [dirty, setDirty] = useState(true);

  const [unitNotice, setUnitNotice] = useState<string | null>(null);

  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  const [locallyQueued, setLocallyQueued] = useState(false);

  const activeLine = lines.find((line) => line.lineId === activeLineId) ?? lines[0]!;

  const { cachedCustomer, cacheFetchedAt, pendingCustomerCreate } = useQuickSalePersistence({
    customer,
    customerId,
    saleIdRef,
    lines,
    note,
    evidenceReferences: parseSourceEvidence(evidence),
    locallyQueued,
    setLines,
    setNote,
    setEvidenceReferences: setEvidence,
    setLocallyQueued,
    offline,
  });

  const [pickerProductQuery, setPickerProductQuery] = useState<string | null>(null);
  const catalog = useQuickSaleCatalog({
    workspaceId,
    customerId,
    pickerProductQuery,
    productName: activeLine.productName,
    trpc,
    offline,
  });
  const { capture, qualityGrades, qualityGradeOptions, visibleProducts, cachedCatalogFetchedAt } =
    catalog;

  const activeLineResolution = resolveLine(activeLine);
  const priceResolutionReady =
    activeLine.productId !== null &&
    activeLine.productId !== undefined &&
    activeLine.qualityGradeId !== null &&
    activeLine.qualityGradeId !== undefined &&
    activeLineResolution.quantity !== null;
  const priceResolution = useQuery({
    ...trpc.pricing.resolve.queryOptions({
      workspaceId,
      productId: activeLine.productId ?? DISABLED_PRICE_PRODUCT_ID,
      qualityGradeId: activeLine.qualityGradeId ?? null,
      customerId,
      unit: activeLine.unit,
      quantity: activeLineResolution.quantity ?? { valueScaled: 1, unit: activeLine.unit },
      asOf: priceResolutionAsOfRef.current,
    }),
    enabled: priceResolutionReady && !locallyQueued && pendingCustomerCreate === null,
  });

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
    setEvidence(formatSourceEvidence(replacementSource.data.evidenceReferences));
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

  const { draftCommand, discardCommand, postCommand, productCreateCommand } = useQuickSaleCommands({
    trpc,
  });

  const draftRef = useRef<SaleDto | null>(null);

  draftRef.current = draft;

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
    const line = emptyLine(crypto.randomUUID() as SaleLineId);
    editLines([...lines, line]);
    setActiveLineId(line.lineId);
  }

  function applyResolvedPrice(): void {
    const selected = priceResolution.data?.selected;
    if (selected === null || selected === undefined) return;
    editLines((current) =>
      current.map((line) =>
        line.lineId === activeLine.lineId
          ? {
              ...line,
              unitPriceText: String(selected.finalUnitPrice.amountMinor),
              priceOrigin: { kind: "rule" as const, priceRuleId: selected.id },
            }
          : line,
      ),
    );
    setUnitNotice(null);
    metrics.count("price_rule_applied_in_sale");
  }

  async function createActiveProduct(): Promise<void> {
    const displayName = activeLine.productName.trim();
    if (!mayCreateProduct || displayName.length === 0 || locallyQueued) return;
    const context = `${activeLine.lineId}\u0000${displayName}\u0000${activeLine.unit}`;
    if (pendingProductRef.current?.context !== context) {
      pendingProductRef.current = { context, productId: crypto.randomUUID() as ProductId };
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

  async function saveDraft(): Promise<SaleDto | null> {
    if (replacementPending) return null;
    setSubmitted(true);
    if (!allValid) {
      metrics.count("validation_error_count");
      return null;
    }
    if (!dirty && draftRef.current !== null) return draftRef.current;

    draftCommand.reset();
    const isNew = draftRef.current === null;
    const saved = await draftCommand.submit(
      buildQuickSalePayload({
        saleId: saleIdRef.current,
        customerId,
        lines,
        resolved,
        note,
        evidenceReferences: parseSourceEvidence(evidence),
        replacesSaleId,
        isNew,
      }),
      isNew ? {} : { expectedVersion: draftRef.current!.version },
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
            lines: buildQuickSalePayload({
              saleId: saleIdRef.current,
              customerId,
              lines,
              resolved,
              note,
              evidenceReferences: parseSourceEvidence(evidence),
              replacesSaleId: null,
              isNew: true,
            }).lines,
            note: note.trim().length === 0 ? null : note.trim(),
            evidenceReferences: parseSourceEvidence(evidence),
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
    activeLineId: activeLine.lineId,
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
    evidence,
    offline,
    pendingCustomerCreate,
    post,
    postCommand,
    productCreateCommand,
    priceResolution,
    applyResolvedPrice,
    productSearchLoading: catalog.productSearchLoading,
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
    setEvidence,
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
