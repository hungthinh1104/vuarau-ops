"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  RECONCILIATION_OBSERVATION_KINDS,
  UNIT_LABEL_VI,
  UNITS,
  reconciliationObservationIdSchema,
  reconciliationObservationKindSchema,
  recordReconciliationObservationCommandSchema,
  type CostObservationCaseKind,
  type ReconciliationObservationId,
  type ReconciliationObservationKind,
  type Unit,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { parseMoneyText, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { ReconciliationEvidenceView } from "@/ui/screens/reconciliation-evidence-view.tsx";

export function ReconciliationEvidenceController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const observations = useQuery(
    trpc.evidence.listReconciliationObservations.queryOptions({
      workspaceId,
      kind: null,
      cursor: null,
      limit: 50,
    }),
  );
  const mutation = useMutation(trpc.evidence.recordReconciliationObservation.mutationOptions());
  const command = useContractCommand(
    recordReconciliationObservationCommandSchema,
    mutation.mutateAsync,
  );
  const observationId = useRef(crypto.randomUUID() as ReconciliationObservationId);
  const [kind, setKind] = useState<ReconciliationObservationKind>("inventory_count");
  const [caseKind, setCaseKind] = useState<CostObservationCaseKind>("normal");
  const [description, setDescription] = useState("");
  const [participantWording, setParticipantWording] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [observedAmount, setObservedAmount] = useState("");
  const [expectedQuantity, setExpectedQuantity] = useState("");
  const [observedQuantity, setObservedQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [itemCount, setItemCount] = useState("");
  const [scopeReference, setScopeReference] = useState("");
  const [evidenceReferences, setEvidenceReferences] = useState("");
  const [relatedObservationId, setRelatedObservationId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setFormError(null);
    const parsedExpectedAmount = parseMoneyText(expectedAmount, "VND");
    const parsedObservedAmount = parseMoneyText(observedAmount, "VND");
    const parsedExpectedQuantity = parseQuantityText(expectedQuantity, unit);
    const parsedObservedQuantity = parseQuantityText(observedQuantity, unit);
    const parsedNumbers = [
      parsedExpectedAmount,
      parsedObservedAmount,
      parsedExpectedQuantity,
      parsedObservedQuantity,
    ];
    const invalid = parsedNumbers.find((result) => !result.ok);
    if (invalid !== undefined && !invalid.ok) {
      setFormError(invalid.reason);
      return;
    }
    const trimmedItemCount = itemCount.trim();
    const parsedItemCount =
      trimmedItemCount.length === 0 ? null : Number.parseInt(trimmedItemCount, 10);
    if (
      trimmedItemCount.length > 0 &&
      (!/^\d+$/.test(trimmedItemCount) || !Number.isSafeInteger(parsedItemCount))
    ) {
      setFormError("Số kiện / dòng phải là số nguyên không âm.");
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
      relatedText.length === 0 ? null : reconciliationObservationIdSchema.safeParse(relatedText);
    if (parsedRelated !== null && !parsedRelated.success) {
      setFormError("ID quan sát điều chỉnh không hợp lệ.");
      return;
    }
    const result = await command.submit({
      reconciliationObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        expectedAmount: parsedExpectedAmount.ok ? parsedExpectedAmount.value : null,
        observedAmount: parsedObservedAmount.ok ? parsedObservedAmount.value : null,
        expectedQuantity: parsedExpectedQuantity.ok ? parsedExpectedQuantity.value : null,
        observedQuantity: parsedObservedQuantity.ok ? parsedObservedQuantity.value : null,
        itemCount: parsedItemCount,
        productId: null,
        qualityGradeId: null,
        scopeReference: scopeReference.trim() || null,
      },
      evidenceReferences: references,
      relatedObservationId: parsedRelated === null ? null : parsedRelated.data,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as ReconciliationObservationId;
    setDescription("");
    setParticipantWording("");
    setExpectedAmount("");
    setObservedAmount("");
    setExpectedQuantity("");
    setObservedQuantity("");
    setItemCount("");
    setScopeReference("");
    setEvidenceReferences("");
    setRelatedObservationId("");
    await observations.refetch();
  }

  return (
    <ReconciliationEvidenceView
      canRecord={session.permissions.includes("evidence.record")}
      query={observations}
      items={observations.data?.items ?? []}
      kind={kind}
      caseKind={caseKind}
      description={description}
      participantWording={participantWording}
      expectedAmount={expectedAmount}
      observedAmount={observedAmount}
      expectedQuantity={expectedQuantity}
      observedQuantity={observedQuantity}
      unit={unit}
      itemCount={itemCount}
      scopeReference={scopeReference}
      evidenceReferences={evidenceReferences}
      relatedObservationId={relatedObservationId}
      formError={formError}
      command={command}
      onKind={(value) => setKind(reconciliationObservationKindSchema.parse(value))}
      onCaseKind={setCaseKind}
      onDescription={setDescription}
      onParticipantWording={setParticipantWording}
      onExpectedAmount={setExpectedAmount}
      onObservedAmount={setObservedAmount}
      onExpectedQuantity={setExpectedQuantity}
      onObservedQuantity={setObservedQuantity}
      onUnit={setUnit}
      onItemCount={setItemCount}
      onScopeReference={setScopeReference}
      onEvidenceReferences={setEvidenceReferences}
      onRelatedObservationId={setRelatedObservationId}
      onSubmit={() => void submit()}
      onRetry={() => void observations.refetch()}
    />
  );
}

export const RECONCILIATION_KIND_OPTIONS = RECONCILIATION_OBSERVATION_KINDS.map((value) => ({
  value,
  label: value,
}));
export const RECONCILIATION_UNIT_OPTIONS = UNITS.map((value) => ({
  value,
  label: UNIT_LABEL_VI[value],
}));
