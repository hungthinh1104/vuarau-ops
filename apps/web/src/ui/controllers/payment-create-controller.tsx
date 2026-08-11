"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  paymentDtoSchema,
  paymentIdSchema,
  recordCustomerPaymentCommandSchema,
  type CustomerId,
  type CustomerDetailDto,
  type PaymentId,
  type PaymentMethod,
  type RecordCustomerPaymentPayload,
} from "@vuarau/domain-contracts";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { hasPermission } from "@/api/session.ts";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useOffline } from "@/offline/provider.tsx";
import { formatMoneyInput, parseMoneyText } from "@/ui/domain/numeric-text.ts";
import { OfflineCommandOutcome } from "@/ui/patterns/feedback/offline-command-outcome.tsx";
import { PaymentCreateView } from "@/ui/screens/payment-create-view.tsx";

export function PaymentCreateController() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const customerId = useParams<{ customerId: string }>().customerId as CustomerId;
  const searchParams = useSearchParams();
  const offlinePaymentParam = paymentIdSchema.safeParse(searchParams.get("offlinePaymentId"));
  const paymentIdRef = useRef<PaymentId>(
    (offlinePaymentParam.success ? offlinePaymentParam.data : crypto.randomUUID()) as PaymentId,
  );
  const [hashPaymentId, setHashPaymentId] = useState<PaymentId | null>(null);
  const offlinePaymentId = offlinePaymentParam.success ? offlinePaymentParam.data : hashPaymentId;
  const offline = useOffline();
  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const [cachedCustomer, setCachedCustomer] = useState<CustomerDetailDto | null>(null);
  const [offlineDraft, setOfflineDraft] =
    useState<Awaited<ReturnType<typeof offline.loadPaymentDraft>>>(null);
  const [queueing, setQueueing] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const record = useMutation(trpc.payment.record.mutationOptions());
  const command = useContractCommand(recordCustomerPaymentCommandSchema, record.mutateAsync);
  const parsed = parseMoneyText(amountText, "VND");
  const amount = parsed.ok ? parsed.value : null;
  const amountError = !parsed.ok
    ? parsed.reason
    : !submitted
      ? undefined
      : amount === null
        ? "Nhập số tiền khách trả."
        : amount.amountMinor <= 0
          ? "Số tiền phải lớn hơn 0."
          : undefined;
  const canRecord = hasPermission(session, "payment.record");

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const parsed = paymentIdSchema.safeParse(hashParams.get("offlinePaymentId"));
    if (!parsed.success) return;
    paymentIdRef.current = parsed.data;
    setHashPaymentId(parsed.data);
  }, []);

  useEffect(() => {
    if (command.phase.kind === "succeeded" && command.result !== null) {
      router.replace(`/payments/${command.result.id}`);
    }
  }, [command.phase.kind, command.result, router]);

  useEffect(() => {
    let active = true;
    void offline.cachedCustomers().then((customers) => {
      const cached = customers.find((candidate) => candidate.customerId === customerId);
      if (active && cached !== undefined) setCachedCustomer(cached.detail);
    });
    return () => {
      active = false;
    };
  }, [customerId, offline.cachedCustomers]);

  useEffect(() => {
    if (customer.data === undefined) return;
    void offline.cacheCustomers([
      {
        ...offline.partition,
        customerId,
        displayName: customer.data.customer.displayName,
        phone: customer.data.customer.phone,
        detail: customer.data,
        fetchedAt: new Date().toISOString(),
      },
    ]);
  }, [customer.data, customerId, offline.cacheCustomers, offline.partition]);

  useEffect(() => {
    if (offlinePaymentId === null) return;
    let active = true;
    void offline.loadPaymentDraft(offlinePaymentId).then((saved) => {
      if (!active || saved === null) return;
      setOfflineDraft(saved);
      setAmountText(formatMoneyInput(saved.payload.amount));
      setMethod(saved.payload.method);
      setPayerName(saved.payload.payerName ?? "");
      setNote(saved.payload.note ?? "");
      setEvidence(saved.payload.evidenceReferences.join("\n"));
    });
    return () => {
      active = false;
    };
  }, [offline.loadPaymentDraft, offlinePaymentId]);

  const offlineRecord = offline.commands.find(
    (record) => record.kind === "payment.record" && record.chainId === paymentIdRef.current,
  );
  const offlineResult =
    offlineRecord?.state === "confirmed" ? paymentDtoSchema.safeParse(offlineRecord.result) : null;
  const offlinePaymentResultId = offlineResult?.success === true ? offlineResult.data.id : null;
  useEffect(() => {
    if (offlinePaymentResultId !== null) router.replace(`/payments/${offlinePaymentResultId}`);
  }, [offlinePaymentResultId, router]);

  // `null` means the cache has no record, not that the customer query has
  // answered. Keep that distinction so QueryStates cannot render the form with
  // an undefined detail during the first client render.
  const customerFallback =
    customer.data ?? offlineDraft?.customerSnapshot ?? cachedCustomer ?? undefined;
  const customerQuery = {
    ...customer,
    data: customerFallback ?? customer.data,
    isPending: customer.isPending && customerFallback === undefined,
    isError: customer.isError && customerFallback === undefined,
  };
  const offlineLocked =
    queueing || (offlineRecord !== undefined && offlineRecord.state !== "confirmed");

  return (
    <PaymentCreateView
      customerId={customerId}
      customer={customerQuery}
      canRecord={canRecord}
      role={session.role}
      amountText={amountText}
      amount={amount}
      amountError={amountError}
      method={method}
      payerName={payerName}
      note={note}
      evidence={evidence}
      command={command}
      offlineLocked={offlineLocked}
      offlineFeedback={
        <OfflineCommandOutcome
          state={offlineRecord?.state ?? null}
          error={offlineRecord?.error ?? null}
          attemptedAction="Ghi nhận thanh toán"
          onRetry={() => void offline.retry()}
        />
      }
      onAmount={setAmountText}
      onMethod={setMethod}
      onPayerName={setPayerName}
      onNote={setNote}
      onEvidence={setEvidence}
      onSubmit={() => {
        setSubmitted(true);
        if (amount === null || amount.amountMinor <= 0) return;
        const payload: RecordCustomerPaymentPayload = {
          paymentId: paymentIdRef.current,
          customerId,
          amount,
          method,
          payerName: payerName.trim().length === 0 ? null : payerName.trim(),
          note: note.trim().length === 0 ? null : note.trim(),
          evidenceReferences: parseEvidenceReferences(evidence),
        };
        if (offlineLocked) return;
        if (!navigator.onLine) {
          setQueueing(true);
          void (async () => {
            try {
              await offline.queuePayment({
                payment: payload,
                occurredAt: new Date().toISOString(),
                ...(customerFallback === undefined || customerFallback === null
                  ? {}
                  : { customerSnapshot: customerFallback }),
              });
              // The payment is already on this screen. A hash is intentionally
              // used for this local recovery pointer: Next's patched
              // history/query handling would start an RSC navigation while the
              // browser is offline. The durable draft remains in IndexedDB.
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}#offlinePaymentId=${paymentIdRef.current}`,
              );
              await offline.retry();
            } finally {
              setQueueing(false);
            }
          })();
          return;
        }
        void command.submit(payload);
      }}
      onRetry={() => void Promise.all([customer.refetch(), offline.retry()])}
      onCancel={() => router.push(`/customers/${customerId}`)}
    />
  );
}

function parseEvidenceReferences(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((reference) => reference.trim())
    .filter((reference) => reference.length > 0);
}
