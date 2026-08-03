"use client";

import { useQuery } from "@tanstack/react-query";
import type { CustomerId, ProductId, QualityGradeId, WorkspaceId } from "@vuarau/domain-contracts";
import type { useTRPC } from "@/api/providers.tsx";
import type { useOffline } from "@/offline/provider.tsx";
import type { CachedProduct, CachedQualityGrade } from "@/offline/types.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import type { SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";
import { useEffect, useState } from "react";

type QuickSaleCatalogProps = {
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly pickerProductQuery: string | null;
  readonly productName: string;
  readonly trpc: ReturnType<typeof useTRPC>;
  readonly offline: ReturnType<typeof useOffline>;
};

export function useQuickSaleCatalog(props: QuickSaleCatalogProps) {
  const activeProductQuery = useDebounced(props.pickerProductQuery ?? props.productName, 200);
  const [cachedProducts, setCachedProducts] = useState<readonly CachedProduct[]>([]);
  const [cachedQualityGrades, setCachedQualityGrades] = useState<readonly CachedQualityGrade[]>([]);

  const capture = useQuery({
    ...props.trpc.sale.captureContext.queryOptions({
      workspaceId: props.workspaceId,
      customerId: props.customerId,
      query: activeProductQuery,
      limit: 10,
    }),
    enabled: props.pickerProductQuery !== null,
  });
  const productSuggestions = useQuery({
    ...props.trpc.product.search.queryOptions({
      workspaceId: props.workspaceId,
      query: activeProductQuery,
      isActive: true,
      cursor: null,
      limit: props.pickerProductQuery === null ? 8 : 12,
    }),
    enabled: props.pickerProductQuery !== null,
  });
  const qualityGrades = useQuery(
    props.trpc.quality.list.queryOptions({
      workspaceId: props.workspaceId,
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
      ...props.offline.partition,
      qualityGradeId: grade.id,
      name: grade.name,
      sortOrder: grade.sortOrder,
      fetchedAt,
    }));
    setCachedQualityGrades(rows);
    void props.offline.cacheQualityGrades(rows);
  }, [props.offline, qualityGrades.data]);

  useEffect(() => {
    if (qualityGrades.data !== undefined) return;
    void props.offline.cachedQualityGrades().then(setCachedQualityGrades);
  }, [props.offline, qualityGrades.data]);

  useEffect(() => {
    if (productSuggestions.data === undefined) return;
    const fetchedAt = new Date().toISOString();
    const rows = productSuggestions.data.items.map((product) => ({
      ...props.offline.partition,
      productId: product.id,
      displayName: product.displayName,
      aliases: product.aliases,
      preferredUnit: product.preferredUnit,
      fetchedAt,
    }));
    setCachedProducts(rows);
    void props.offline.cacheProducts(rows);
  }, [productSuggestions.data, props.offline]);

  useEffect(() => {
    if (productSuggestions.data !== undefined) return;
    void props.offline.cachedProducts().then(setCachedProducts);
  }, [productSuggestions.data, props.offline]);

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
  ).map((grade) => ({ value: grade.id, label: grade.name }));

  return {
    activeProductQuery,
    cachedCatalogFetchedAt,
    cachedProducts,
    cachedQualityGrades,
    capture,
    productSearchLoading: productSuggestions.isFetching || capture.isFetching,
    productSuggestions,
    qualityGradeOptions,
    qualityGrades,
    visibleProducts,
  };
}
