"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  COST_OBSERVATION_CASE_KINDS,
  COST_OBSERVATION_KINDS,
  UNIT_LABEL_VI,
  UNITS,
  costObservationKindSchema,
  costObservationIdSchema,
  recordCostObservationCommandSchema,
  type CostObservationCaseKind,
  type CostObservationId,
  type CostObservationKind,
  type Unit,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { parseMoneyText, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { EvidenceView } from "@/ui/screens/evidence-view.tsx";

export function EvidenceController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const observations = useQuery(
    trpc.evidence.listCostObservations.queryOptions({
      workspaceId,
      kind: null,
      cursor: null,
      limit: 50,
    }),
  );
  const mutation = useMutation(trpc.evidence.recordCostObservation.mutationOptions());
  const command = useContractCommand(recordCostObservationCommandSchema, mutation.mutateAsync);
  const observationId = useRef(crypto.randomUUID() as CostObservationId);
  const [kind, setKind] = useState<CostObservationKind>("other");
  const [caseKind, setCaseKind] = useState<CostObservationCaseKind>("normal");
  const [description, setDescription] = useState("");
  const [participantWording, setParticipantWording] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [sourceReference, setSourceReference] = useState("");
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
    const parsedQuantity = parseQuantityText(quantity, unit);
    if (!parsedQuantity.ok) {
      setFormError(parsedQuantity.reason);
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
      relatedText.length === 0 ? null : costObservationIdSchema.safeParse(relatedText);
    if (parsedRelated !== null && !parsedRelated.success) {
      setFormError("ID quan sát điều chỉnh không hợp lệ.");
      return;
    }
    const result = await command.submit({
      costObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        amount: parsedAmount.value,
        quantity: parsedQuantity.value,
        productId: null,
        qualityGradeId: null,
        sourceReference: sourceReference.trim() || null,
      },
      evidenceReferences: references,
      relatedObservationId: parsedRelated === null ? null : parsedRelated.data,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as CostObservationId;
    setDescription("");
    setParticipantWording("");
    setAmount("");
    setQuantity("");
    setSourceReference("");
    setEvidenceReferences("");
    setRelatedObservationId("");
    await observations.refetch();
  }

  return (
    <EvidenceView
      canRecord={session.permissions.includes("evidence.record")}
      query={observations}
      items={observations.data?.items ?? []}
      kind={kind}
      caseKind={caseKind}
      description={description}
      participantWording={participantWording}
      amount={amount}
      quantity={quantity}
      unit={unit}
      sourceReference={sourceReference}
      evidenceReferences={evidenceReferences}
      relatedObservationId={relatedObservationId}
      formError={formError}
      command={command}
      onKind={(value) => setKind(costObservationKindSchema.parse(value))}
      onCaseKind={setCaseKind}
      onDescription={setDescription}
      onParticipantWording={setParticipantWording}
      onAmount={setAmount}
      onQuantity={setQuantity}
      onUnit={setUnit}
      onSourceReference={setSourceReference}
      onEvidenceReferences={setEvidenceReferences}
      onRelatedObservationId={setRelatedObservationId}
      onSubmit={() => void submit()}
      onRetry={() => void observations.refetch()}
    />
  );
}

export const COST_KIND_OPTIONS = COST_OBSERVATION_KINDS.map((value) => ({ value, label: value }));
export const COST_CASE_OPTIONS = COST_OBSERVATION_CASE_KINDS.map((value) => ({
  value,
  label: value,
}));
export const UNIT_OPTIONS = UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }));
