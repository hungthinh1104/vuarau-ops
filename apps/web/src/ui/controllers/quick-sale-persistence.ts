"use client";

import type { CustomerDetailDto, CustomerId, SaleDto } from "@vuarau/domain-contracts";
import {
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { useOffline } from "@/offline/provider.tsx";
import type { SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";

type CustomerQuery = {
  readonly data: CustomerDetailDto | undefined;
};

type QuickSalePersistenceProps = {
  readonly customer: CustomerQuery;
  readonly customerId: CustomerId;
  readonly saleIdRef: MutableRefObject<SaleDto["id"]>;
  readonly lines: readonly SaleLineDraft[];
  readonly note: string;
  readonly locallyQueued: boolean;
  readonly setLines: Dispatch<SetStateAction<readonly SaleLineDraft[]>>;
  readonly setNote: Dispatch<SetStateAction<string>>;
  readonly setLocallyQueued: Dispatch<SetStateAction<boolean>>;
  readonly offline: ReturnType<typeof useOffline>;
};

export function useQuickSalePersistence(props: QuickSalePersistenceProps) {
  const [cachedCustomer, setCachedCustomer] = useState<CustomerDetailDto | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [pendingCustomerCreate, setPendingCustomerCreate] = useState<{
    readonly customerId: string;
    readonly displayName: string;
    readonly phone: string | null;
    readonly note: string | null;
  } | null>(null);
  const [localHydrated, setLocalHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void props.offline.loadDraft(props.saleIdRef.current).then((saved) => {
      if (!active) return;
      if (saved !== null) {
        props.setLines(saved.lines as readonly SaleLineDraft[]);
        props.setNote(saved.note ?? "");
        props.setLocallyQueued(saved.syncState !== "local");
      }
      setLocalHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [
    props.offline.loadDraft,
    props.saleIdRef,
    props.setLines,
    props.setLocallyQueued,
    props.setNote,
  ]);

  useEffect(() => {
    if (!localHydrated || props.locallyQueued) return;
    void props.offline.saveDraft({
      saleId: props.saleIdRef.current,
      customerId: props.customerId,
      ...props.offline.partition,
      lines: props.lines,
      note: props.note.trim().length === 0 ? null : props.note,
      occurredAt: new Date().toISOString(),
      syncState: "local",
      updatedAt: new Date().toISOString(),
    });
  }, [
    localHydrated,
    props.customerId,
    props.lines,
    props.locallyQueued,
    props.note,
    props.offline.partition,
    props.offline.saveDraft,
    props.saleIdRef,
  ]);

  useEffect(() => {
    if (props.customer.data === undefined) return;
    void props.offline.cacheCustomers([
      {
        ...props.offline.partition,
        customerId: props.customerId,
        displayName: props.customer.data.customer.displayName,
        phone: props.customer.data.customer.phone,
        detail: props.customer.data,
        fetchedAt: new Date().toISOString(),
      },
    ]);
  }, [props.customer.data, props.customerId, props.offline]);

  useEffect(() => {
    if (props.customer.data !== undefined) return;
    let active = true;
    void props.offline.cachedCustomers().then((customers) => {
      const cached = customers.find((candidate) => candidate.customerId === props.customerId);
      if (!active || cached === undefined) return;
      setCachedCustomer(cached.detail);
      setCacheFetchedAt(cached.fetchedAt);
      setPendingCustomerCreate(cached.pendingCreate ?? null);
    });
    return () => {
      active = false;
    };
  }, [props.customer.data, props.customerId, props.offline]);

  return { cachedCustomer, cacheFetchedAt, pendingCustomerCreate };
}
