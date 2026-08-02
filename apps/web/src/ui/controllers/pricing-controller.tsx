"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  recordPriceRuleCommandSchema,
  type Cursor,
  type CustomerId,
  type Page,
  type PriceRuleKind,
  type PriceRuleDto,
  type PriceRuleId,
  type ProductId,
  type QualityGradeId,
  type Unit,
} from "@vuarau/domain-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import { parseMoneyText, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { PricingView } from "@/ui/screens/pricing-view.tsx";

const EMPTY_CURSOR = null;

function localDateTimeNow(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function parseInteger(raw: string, label: string): { value: number } | { error: string } {
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= 0
    ? { value }
    : { error: `${label} phải là số nguyên không âm.` };
}

function parseInstant(raw: string, label: string): { value: string } | { error: string } {
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? { error: `${label} không hợp lệ.` }
    : { value: date.toISOString() };
}

export function PricingController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [cursor, setCursor] = useState<Cursor | null>(EMPTY_CURSOR);
  const [pages, setPages] = useState<readonly Page<PriceRuleDto>[]>([]);
  const rules = useQuery(
    trpc.pricing.list.queryOptions({
      workspaceId,
      productId: null,
      qualityGradeId: null,
      customerId: null,
      unit: null,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (rules.data === undefined) return;
    setPages((current) => (cursor === null ? [rules.data] : [...current, rules.data]));
  }, [cursor, rules.data]);

  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: useDebounced(productSearch, 200),
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const customers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: useDebounced(customerSearch, 200),
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const grades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );

  const [productId, setProductId] = useState("");
  const [qualityGradeId, setQualityGradeId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [kind, setKind] = useState<PriceRuleKind>("list");
  const [unit, setUnit] = useState<Unit>("kg");
  const [priority, setPriority] = useState("0");
  const [minimumQuantity, setMinimumQuantity] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTimeNow);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [fee, setFee] = useState("0");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const priceRuleId = useRef(crypto.randomUUID() as PriceRuleId);
  const mutation = useMutation(trpc.pricing.record.mutationOptions());
  const command = useContractCommand(recordPriceRuleCommandSchema, mutation.mutateAsync);

  const items = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  const refresh = useCallback(async () => {
    setCursor(null);
    setPages([]);
    await rules.refetch();
  }, [rules.refetch]);

  async function submit(): Promise<void> {
    setFormError(null);
    if (productId.length === 0) {
      setFormError("Chọn mặt hàng trước khi ghi rule.");
      return;
    }
    if (kind === "customer" && customerId.length === 0) {
      setFormError("Rule theo khách hàng phải chọn khách hàng.");
      return;
    }
    if (kind !== "customer" && customerId.length > 0) {
      setFormError("Chỉ rule theo khách hàng mới được gắn khách hàng.");
      return;
    }

    const base = parseMoneyText(basePrice, "VND");
    const discountValue = parseMoneyText(discount, "VND");
    const feeValue = parseMoneyText(fee, "VND");
    if (!base.ok || !discountValue.ok || !feeValue.ok) {
      setFormError(
        [base, discountValue, feeValue].find((result) => !result.ok)?.reason ??
          "Kiểm tra các trường tiền.",
      );
      return;
    }
    if (base.value === null || discountValue.value === null || feeValue.value === null) {
      setFormError("Giá cơ sở, giảm giá và phí phải có giá trị.");
      return;
    }
    if (
      base.value.amountMinor < 0 ||
      discountValue.value.amountMinor < 0 ||
      feeValue.value.amountMinor < 0
    ) {
      setFormError("Giá cơ sở, giảm giá và phí không được âm.");
      return;
    }
    const quantity = parseQuantityText(minimumQuantity, unit);
    if (!quantity.ok || quantity.value === null) {
      setFormError(quantity.ok ? "Ngưỡng số lượng phải có giá trị." : quantity.reason);
      return;
    }
    if (quantity.value.valueScaled < 0) {
      setFormError("Ngưỡng số lượng không được âm.");
      return;
    }
    const priorityValue = parseInteger(priority, "Độ ưu tiên");
    if ("error" in priorityValue) {
      setFormError(priorityValue.error);
      return;
    }
    const from = parseInstant(effectiveFrom, "Hiệu lực từ");
    if ("error" in from) {
      setFormError(from.error);
      return;
    }
    const to = effectiveTo.trim().length === 0 ? null : parseInstant(effectiveTo, "Hiệu lực đến");
    if (to !== null && "error" in to) {
      setFormError(to.error);
      return;
    }
    if (to !== null && to.value <= from.value) {
      setFormError("Hiệu lực đến phải sau hiệu lực từ.");
      return;
    }
    if (kind === "override" && reason.trim().length === 0) {
      setFormError("Rule override phải có lý do.");
      return;
    }

    const result = await command.submit({
      priceRuleId: priceRuleId.current,
      productId: productId as ProductId,
      qualityGradeId: qualityGradeId.length === 0 ? null : (qualityGradeId as QualityGradeId),
      customerId: customerId.length === 0 ? null : (customerId as CustomerId),
      unit,
      kind,
      priority: priorityValue.value,
      minimumQuantityScaled: quantity.value.valueScaled,
      effectiveFrom: from.value,
      effectiveTo: to === null ? null : to.value,
      baseUnitPrice: base.value,
      discountPerUnit: discountValue.value,
      feePerUnit: feeValue.value,
      reason: reason.trim().length === 0 ? null : reason.trim(),
    });
    if (result === null) return;
    priceRuleId.current = crypto.randomUUID() as PriceRuleId;
    setBasePrice("");
    setDiscount("0");
    setFee("0");
    setReason("");
    await refresh();
  }

  return (
    <PricingView
      rules={rules}
      items={items}
      nextCursor={nextCursor}
      isFetching={rules.isFetching}
      products={products.data?.items ?? []}
      customers={customers.data?.items ?? []}
      grades={grades.data?.items ?? []}
      mayManage={session.permissions.includes("pricing.manage")}
      productSearch={productSearch}
      customerSearch={customerSearch}
      productId={productId}
      qualityGradeId={qualityGradeId}
      customerId={customerId}
      kind={kind}
      unit={unit}
      priority={priority}
      minimumQuantity={minimumQuantity}
      effectiveFrom={effectiveFrom}
      effectiveTo={effectiveTo}
      basePrice={basePrice}
      discount={discount}
      fee={fee}
      reason={reason}
      formError={formError}
      command={command}
      onProductSearch={setProductSearch}
      onCustomerSearch={setCustomerSearch}
      onProductId={setProductId}
      onQualityGradeId={setQualityGradeId}
      onCustomerId={setCustomerId}
      onKind={(nextKind) => {
        setKind(nextKind);
        if (nextKind !== "customer") setCustomerId("");
      }}
      onUnit={setUnit}
      onPriority={setPriority}
      onMinimumQuantity={setMinimumQuantity}
      onEffectiveFrom={setEffectiveFrom}
      onEffectiveTo={setEffectiveTo}
      onBasePrice={setBasePrice}
      onDiscount={setDiscount}
      onFee={setFee}
      onReason={setReason}
      onSubmit={() => void submit()}
      onRetry={() => void rules.refetch()}
      onLoadMore={() => {
        if (nextCursor !== null) setCursor(nextCursor);
      }}
      onReload={refresh}
    />
  );
}
