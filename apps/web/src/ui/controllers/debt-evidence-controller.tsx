"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DEBT_OBSERVATION_KINDS,
  COST_OBSERVATION_CASE_KINDS,
  debtObservationIdSchema,
  debtObservationKindSchema,
  recordDebtObservationCommandSchema,
  type CostObservationCaseKind,
  type DebtObservationId,
  type DebtObservationKind,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { parseMoneyText } from "@/ui/domain/numeric-text.ts";
import { DebtEvidenceView } from "@/ui/screens/debt-evidence-view.tsx";

export function DebtEvidenceController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
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
  const [kind, setKind] = useState<DebtObservationKind>("agreed_due_date");
  const [caseKind, setCaseKind] = useState<CostObservationCaseKind>("normal");
  const [description, setDescription] = useState("");
  const [participantWording, setParticipantWording] = useState("");
  const [amount, setAmount] = useState("");
  const [agreedDueAt, setAgreedDueAt] = useState("");
  const [promiseToPayAt, setPromiseToPayAt] = useState("");
  const [termCode, setTermCode] = useState("");
  const [termText, setTermText] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [allocationProposal, setAllocationProposal] = useState("");
  const [evidenceReferences, setEvidenceReferences] = useState("");
  const [relatedObservationId, setRelatedObservationId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setFormError(null);
    const parsedAmount = parseMoneyText(amount, "VND");
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
    const relatedText = relatedObservationId.trim();
    const parsedRelated =
      relatedText.length === 0 ? null : debtObservationIdSchema.safeParse(relatedText);
    if (parsedRelated !== null && !parsedRelated.success) {
      setFormError("ID quan sát điều chỉnh không hợp lệ.");
      return;
    }
    const result = await command.submit({
      debtObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        amount: parsedAmount.value,
        agreedDueAt: agreedDueAt.trim() === "" ? null : new Date(agreedDueAt).toISOString(),
        promiseToPayAt:
          promiseToPayAt.trim() === "" ? null : new Date(promiseToPayAt).toISOString(),
        termCode: termCode.trim() || null,
        termText: termText.trim() || null,
        paymentReference: paymentReference.trim() || null,
        allocationProposal: allocationProposal.trim() || null,
        customerId: null,
      },
      evidenceReferences: references,
      relatedObservationId: parsedRelated === null ? null : parsedRelated.data,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as DebtObservationId;
    setDescription("");
    setParticipantWording("");
    setAmount("");
    setAgreedDueAt("");
    setPromiseToPayAt("");
    setTermCode("");
    setTermText("");
    setPaymentReference("");
    setAllocationProposal("");
    setEvidenceReferences("");
    setRelatedObservationId("");
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
      amount={amount}
      agreedDueAt={agreedDueAt}
      promiseToPayAt={promiseToPayAt}
      termCode={termCode}
      termText={termText}
      paymentReference={paymentReference}
      allocationProposal={allocationProposal}
      evidenceReferences={evidenceReferences}
      relatedObservationId={relatedObservationId}
      formError={formError}
      command={command}
      onKind={(value) => setKind(debtObservationKindSchema.parse(value))}
      onCaseKind={setCaseKind}
      onDescription={setDescription}
      onParticipantWording={setParticipantWording}
      onAmount={setAmount}
      onAgreedDueAt={setAgreedDueAt}
      onPromiseToPayAt={setPromiseToPayAt}
      onTermCode={setTermCode}
      onTermText={setTermText}
      onPaymentReference={setPaymentReference}
      onAllocationProposal={setAllocationProposal}
      onEvidenceReferences={setEvidenceReferences}
      onRelatedObservationId={setRelatedObservationId}
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
