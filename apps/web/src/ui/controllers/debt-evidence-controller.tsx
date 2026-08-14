"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DEBT_OBSERVATION_KINDS,
  COST_OBSERVATION_CASE_KINDS,
  debtObservationIdSchema,
  debtObservationKindSchema,
  isObservationFactAllowed,
  recordDebtObservationCommandSchema,
  type CostObservationCaseKind,
  type CustomerId,
  type DebtObservationId,
  type DebtObservationKind,
} from "@vuarau/domain-contracts";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { formatMoneyInput, parseMoneyText } from "@/ui/domain/numeric-text.ts";
import { formatVietnamDateTimeLocal, parseVietnamDateTimeLocal } from "@/ui/domain/time.ts";
import { DebtEvidenceView } from "@/ui/screens/debt-evidence-view.tsx";

export function DebtEvidenceController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const observations = useQuery(
    trpc.evidence.listDebtObservations.queryOptions({
      workspaceId,
      kind: null,
      cursor: null,
      limit: 50,
    }),
  );
  const mutation = useMutation(trpc.evidence.recordDebtObservation.mutationOptions());
  const command = useContractCommand(recordDebtObservationCommandSchema, mutation.mutateAsync);
  const observationId = useRef(crypto.randomUUID() as DebtObservationId);
  const [kind, setKind] = useState<DebtObservationKind>(() => {
    const parsed = debtObservationKindSchema.safeParse(searchParams.get("kind"));
    return parsed.success ? parsed.data : "agreed_due_date";
  });
  const [caseKind, setCaseKind] = useState<CostObservationCaseKind>("normal");
  const [description, setDescription] = useState("");
  const [participantWording, setParticipantWording] = useState("");
  const [customerId, setCustomerId] = useState<CustomerId | null>(() => {
    const raw = searchParams.get("customerId");
    return raw === null ? null : (raw as CustomerId);
  });
  const [amount, setAmount] = useState("");
  const [agreedDueAt, setAgreedDueAt] = useState("");
  const [promiseToPayAt, setPromiseToPayAt] = useState("");
  const [termCode, setTermCode] = useState("");
  const [termText, setTermText] = useState("");
  const [paymentReference, setPaymentReference] = useState(
    () => searchParams.get("paymentReference") ?? "",
  );
  const [allocationProposal, setAllocationProposal] = useState("");
  const [evidenceReferences, setEvidenceReferences] = useState("");
  const [relatedObservationId, setRelatedObservationId] = useState<DebtObservationId | "">("");
  const [relatedObservationLabel, setRelatedObservationLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setFormError(null);
    const parsedAmount = isObservationFactAllowed("debt", kind, "amount")
      ? parseMoneyText(amount, "VND")
      : { ok: true as const, value: null };
    if (!parsedAmount.ok) {
      setFormError(parsedAmount.reason);
      return;
    }
    const references = evidenceReferences
      .split("\n")
      .map((reference) => reference.trim())
      .filter((reference) => reference.length > 0);
    if (references.length === 0) {
      setFormError("Cần ít nhất một tham chiếu nguồn.");
      return;
    }
    if (caseKind === "correction" && relatedObservationId === "") {
      setFormError("Chọn bản ghi cần điều chỉnh trong lịch sử bên dưới.");
      return;
    }
    const dueAt = !isObservationFactAllowed("debt", kind, "agreedDueAt")
      ? { ok: true as const, value: null }
      : agreedDueAt.trim() === ""
        ? { ok: true as const, value: null }
        : parseVietnamDateTimeLocal(agreedDueAt, "Hạn thanh toán");
    const promiseAt = !isObservationFactAllowed("debt", kind, "promiseToPayAt")
      ? { ok: true as const, value: null }
      : promiseToPayAt.trim() === ""
        ? { ok: true as const, value: null }
        : parseVietnamDateTimeLocal(promiseToPayAt, "Hẹn thanh toán");
    if (!dueAt.ok) {
      setFormError(dueAt.reason);
      return;
    }
    if (!promiseAt.ok) {
      setFormError(promiseAt.reason);
      return;
    }
    const result = await command.submit({
      debtObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        amount: fact(kind, "amount", parsedAmount.value),
        agreedDueAt: fact(kind, "agreedDueAt", dueAt.value),
        promiseToPayAt: fact(kind, "promiseToPayAt", promiseAt.value),
        termCode: fact(kind, "termCode", termCode.trim() || null),
        termText: fact(kind, "termText", termText.trim() || null),
        paymentReference: fact(kind, "paymentReference", paymentReference.trim() || null),
        allocationProposal: fact(kind, "allocationProposal", allocationProposal.trim() || null),
        customerId: fact(kind, "customerId", customerId),
      },
      evidenceReferences: references,
      relatedObservationId: relatedObservationId === "" ? null : relatedObservationId,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as DebtObservationId;
    setDescription("");
    setParticipantWording("");
    setCustomerId(null);
    setAmount("");
    setAgreedDueAt("");
    setPromiseToPayAt("");
    setTermCode("");
    setTermText("");
    setPaymentReference("");
    setAllocationProposal("");
    setEvidenceReferences("");
    setRelatedObservationId("");
    setRelatedObservationLabel("");
    await observations.refetch();
  }

  return (
    <DebtEvidenceView
      canRecord={session.permissions.includes("evidence.record")}
      query={observations}
      items={observations.data?.items ?? []}
      kind={kind}
      caseKind={caseKind}
      description={description}
      participantWording={participantWording}
      customerId={customerId}
      amount={amount}
      agreedDueAt={agreedDueAt}
      promiseToPayAt={promiseToPayAt}
      termCode={termCode}
      termText={termText}
      paymentReference={paymentReference}
      allocationProposal={allocationProposal}
      evidenceReferences={evidenceReferences}
      relatedObservationLabel={relatedObservationLabel}
      formError={formError}
      command={command}
      onKind={(value) => setKind(debtObservationKindSchema.parse(value))}
      onCaseKind={setCaseKind}
      onDescription={setDescription}
      onParticipantWording={setParticipantWording}
      onCustomerId={(value) =>
        setCustomerId(value.trim() === "" ? null : (value.trim() as CustomerId))
      }
      onAmount={setAmount}
      onAgreedDueAt={setAgreedDueAt}
      onPromiseToPayAt={setPromiseToPayAt}
      onTermCode={setTermCode}
      onTermText={setTermText}
      onPaymentReference={setPaymentReference}
      onAllocationProposal={setAllocationProposal}
      onEvidenceReferences={setEvidenceReferences}
      onStartCorrection={(id, label) => {
        const item = observations.data?.items.find((candidate) => candidate.id === id);
        if (item === undefined) return;
        setCaseKind("correction");
        setRelatedObservationId(debtObservationIdSchema.parse(id));
        setRelatedObservationLabel(label);
        setKind(item.kind);
        setDescription(item.description);
        setParticipantWording(item.participantWording);
        setCustomerId(item.facts.customerId);
        setAmount(item.facts.amount === null ? "" : formatMoneyInput(item.facts.amount));
        setAgreedDueAt(
          item.facts.agreedDueAt === null ? "" : formatVietnamDateTimeLocal(item.facts.agreedDueAt),
        );
        setPromiseToPayAt(
          item.facts.promiseToPayAt === null
            ? ""
            : formatVietnamDateTimeLocal(item.facts.promiseToPayAt),
        );
        setTermCode(item.facts.termCode ?? "");
        setTermText(item.facts.termText ?? "");
        setPaymentReference(item.facts.paymentReference ?? "");
        setAllocationProposal(item.facts.allocationProposal ?? "");
        setEvidenceReferences(item.evidenceReferences.join("\n"));
      }}
      onClearCorrection={() => {
        setRelatedObservationId("");
        setRelatedObservationLabel("");
      }}
      onSubmit={() => void submit()}
      onRetry={() => void observations.refetch()}
    />
  );
}

export const DEBT_KIND_OPTIONS = DEBT_OBSERVATION_KINDS.map((value) => ({ value, label: value }));
export const DEBT_CASE_OPTIONS = COST_OBSERVATION_CASE_KINDS.map((value) => ({
  value,
  label: value,
}));

function fact<T>(kind: DebtObservationKind, name: string, value: T): T | null {
  return isObservationFactAllowed("debt", kind, name) ? value : null;
}
