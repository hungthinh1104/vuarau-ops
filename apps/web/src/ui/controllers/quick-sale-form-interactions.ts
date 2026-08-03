"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";
import type { SaleLineField } from "@/ui/patterns/sale/quick-sale-lines-section.tsx";
import type { QuickSaleDraftState } from "@/ui/screens/quick-sale-view.tsx";
import type { QuickSaleFormModel } from "@/ui/controllers/quick-sale-form-model.ts";

export function useQuickSaleFormInteractions(model: QuickSaleFormModel) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const toastedRef = useRef(false);

  useEffect(() => {
    if (model.postCommand.phase.kind === "succeeded" && !toastedRef.current) {
      toastedRef.current = true;
      toast.success("Đã chốt đơn thành công");
    }
  }, [model.postCommand.phase.kind]);

  function openProductPicker(lineId: string): void {
    model.setActiveLineId(lineId);
    model.setPickerProductQuery("");
    setPickerOpen(true);
  }

  function closeProductPicker(): void {
    setPickerOpen(false);
    model.setPickerProductQuery(null);
  }

  async function handleConfirmedPost(): Promise<void> {
    setPosting(true);
    try {
      await model.post();
    } finally {
      setPosting(false);
      setConfirmOpen(false);
    }
  }

  function advanceFromLine(index: number): void {
    const line = model.lines[index];
    if (
      line === undefined ||
      model.resolved[index]?.total === null ||
      line.productId === null ||
      line.productId === undefined ||
      line.qualityGradeId === null ||
      line.qualityGradeId === undefined ||
      line.qualityGradeName === null ||
      line.qualityGradeName === undefined
    ) {
      return;
    }
    const focusProductAt = (at: number) => {
      requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>("[data-sale-field='product']")[at]?.focus();
      });
    };
    if (index < model.lines.length - 1) {
      focusProductAt(index + 1);
      return;
    }
    model.addLine();
    requestAnimationFrame(() => focusProductAt(index + 1));
  }

  function changeLine(index: number, incoming: SaleLineDraft, field: SaleLineField): void {
    model.editLines((current) =>
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
        const appliedRule = existing.priceOrigin?.kind === "rule";
        const productChanged =
          existing.productName !== next.productName || existing.productId !== next.productId;
        const unitChanged = existing.unit !== next.unit;
        const qualityGradeChanged = existing.qualityGradeId !== next.qualityGradeId;
        const quantityChanged = existing.quantityText !== next.quantityText;
        if (
          appliedRule &&
          (productChanged || unitChanged || qualityGradeChanged || quantityChanged)
        ) {
          model.setUnitNotice(
            "Giá rule đã xoá vì điều kiện mặt hàng, phẩm cấp, đơn vị hoặc số lượng thay đổi.",
          );
          model.metrics.count("price_rule_cleared_after_context_change");
          return {
            ...next,
            productId: productChanged ? null : (next.productId ?? null),
            unitPriceText: "",
            priceOrigin: null,
          };
        }
        if (recalled && (productChanged || unitChanged)) {
          model.setUnitNotice("Giá lần trước đã được xoá vì mặt hàng hoặc đơn vị thay đổi.");
          model.metrics.count("recalled_price_cleared_after_context_change");
          return {
            ...next,
            productId: productChanged ? null : (next.productId ?? null),
            unitPriceText: "",
            priceOrigin: null,
          };
        }
        if (existing.unitPriceText !== next.unitPriceText && appliedRule) {
          model.metrics.count("price_rule_changed_after_apply");
          return { ...next, priceOrigin: { kind: "manual" } };
        }
        if (existing.unitPriceText !== next.unitPriceText && recalled) {
          model.metrics.count("historical_price_changed_after_apply");
          return { ...next, priceOrigin: { kind: "manual" } };
        }
        if (existing.unitPriceText !== next.unitPriceText && next.unitPriceText.length > 0) {
          return { ...next, priceOrigin: { kind: "manual" } };
        }
        return productChanged ? { ...next, productId: null } : next;
      }),
    );
  }

  const effectiveCustomer =
    model.cachedCustomer === null
      ? model.customer
      : ({
          ...model.customer,
          data: model.cachedCustomer,
          isPending: false,
          isError: false,
          error: null,
        } as typeof model.customer);
  const draftState: QuickSaleDraftState = model.locallyQueued
    ? model.offline.blockedCount > 0
      ? "sync_attention"
      : "queued"
    : model.draft === null
      ? "unsaved"
      : model.dirty
        ? "dirty"
        : "saved";
  const postLocked =
    model.postCommand.phase.kind === "sending" ||
    model.postCommand.phase.kind === "unknown" ||
    model.draftCommand.phase.kind === "sending" ||
    model.draftCommand.phase.kind === "unknown";
  const productCreateLocked =
    model.productCreateCommand.phase.kind === "sending" ||
    model.productCreateCommand.phase.kind === "unknown";

  return {
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
    changeLine,
    advanceFromLine,
  };
}
