"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  COST_OBSERVATION_CASE_KINDS,
  SUPPLY_COMMITMENT_OBSERVATION_KINDS,
  UNIT_LABEL_VI,
  UNITS,
  recordSupplyCommitmentObservationCommandSchema,
  supplyCommitmentObservationIdSchema,
  supplyCommitmentObservationKindSchema,
  type CostObservationCaseKind,
  type SupplyCommitmentObservationId,
  type SupplyCommitmentObservationKind,
  type Unit,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { SupplyCommitmentEvidenceView } from "@/ui/screens/supply-commitment-evidence-view.tsx";

export function SupplyCommitmentEvidenceController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const observations = useQuery(
    trpc.evidence.listSupplyCommitmentObservations.queryOptions({
      workspaceId,
      kind: null,
      cursor: null,
      limit: 50,
    }),
  );
  const mutation = useMutation(trpc.evidence.recordSupplyCommitmentObservation.mutationOptions());
  const command = useContractCommand(
    recordSupplyCommitmentObservationCommandSchema,
    mutation.mutateAsync,
  );
  const observationId = useRef(crypto.randomUUID() as SupplyCommitmentObservationId);
  const [kind, setKind] = useState<SupplyCommitmentObservationKind>("promised_supply");
  const [caseKind, setCaseKind] = useState<CostObservationCaseKind>("normal");
  const [description, setDescription] = useState("");
  const [participantWording, setParticipantWording] = useState("");
  const [counterpartyLabel, setCounterpartyLabel] = useState("");
  const [promisedQuantity, setPromisedQuantity] = useState("");
  const [minimumOrder, setMinimumOrder] = useState("");
  const [expectedArrivalAt, setExpectedArrivalAt] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [commitmentReference, setCommitmentReference] = useState("");
  const [evidenceReferences, setEvidenceReferences] = useState("");
  const [relatedObservationId, setRelatedObservationId] = useState<
    SupplyCommitmentObservationId | ""
  >("");
  const [relatedObservationLabel, setRelatedObservationLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setFormError(null);
    const promised = parseQuantityText(promisedQuantity, unit);
    const minimum = parseQuantityText(minimumOrder, unit);
    if (!promised.ok) {
      setFormError(promised.reason);
      return;
    }
    if (!minimum.ok) {
      setFormError(minimum.reason);
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
    const parsedArrival = parseOptionalInstant(expectedArrivalAt);
    if (!parsedArrival.ok) {
      setFormError(parsedArrival.reason);
      return;
    }
    if (caseKind === "correction" && relatedObservationId === "") {
      setFormError("Chọn bản ghi cần điều chỉnh trong lịch sử bên dưới.");
      return;
    }
    const result = await command.submit({
      supplyCommitmentObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        supplierId: null,
        productId: null,
        qualityGradeId: null,
        promisedQuantity: promised.value,
        minimumOrder: minimum.value,
        expectedArrivalAt: parsedArrival.value,
        counterpartyLabel: counterpartyLabel.trim() || null,
        commitmentReference: commitmentReference.trim() || null,
      },
      evidenceReferences: references,
      relatedObservationId: relatedObservationId === "" ? null : relatedObservationId,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as SupplyCommitmentObservationId;
    setDescription("");
    setParticipantWording("");
    setCounterpartyLabel("");
    setPromisedQuantity("");
    setMinimumOrder("");
    setExpectedArrivalAt("");
    setCommitmentReference("");
    setEvidenceReferences("");
    setRelatedObservationId("");
    setRelatedObservationLabel("");
    await observations.refetch();
  }

  return (
    <SupplyCommitmentEvidenceView
      canRecord={session.permissions.includes("evidence.record")}
      query={observations}
      items={observations.data?.items ?? []}
      kind={kind}
      caseKind={caseKind}
      description={description}
      participantWording={participantWording}
      counterpartyLabel={counterpartyLabel}
      promisedQuantity={promisedQuantity}
      minimumOrder={minimumOrder}
      expectedArrivalAt={expectedArrivalAt}
      unit={unit}
      commitmentReference={commitmentReference}
      evidenceReferences={evidenceReferences}
      relatedObservationLabel={relatedObservationLabel}
      formError={formError}
      command={command}
      onKind={(value) => setKind(supplyCommitmentObservationKindSchema.parse(value))}
      onCaseKind={setCaseKind}
      onDescription={setDescription}
      onParticipantWording={setParticipantWording}
      onCounterpartyLabel={setCounterpartyLabel}
      onPromisedQuantity={setPromisedQuantity}
      onMinimumOrder={setMinimumOrder}
      onExpectedArrivalAt={setExpectedArrivalAt}
      onUnit={setUnit}
      onCommitmentReference={setCommitmentReference}
      onEvidenceReferences={setEvidenceReferences}
      onStartCorrection={(id, label) => {
        setCaseKind("correction");
        setRelatedObservationId(supplyCommitmentObservationIdSchema.parse(id));
        setRelatedObservationLabel(label);
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

function parseOptionalInstant(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true as const, value: null };
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime())
    ? { ok: false as const, reason: "Ngày giờ dự kiến không hợp lệ." }
    : { ok: true as const, value: date.toISOString() };
}

export const SUPPLY_COMMITMENT_KIND_OPTIONS = SUPPLY_COMMITMENT_OBSERVATION_KINDS.map((value) => ({
  value,
  label: value,
}));
export const SUPPLY_COMMITMENT_CASE_OPTIONS = COST_OBSERVATION_CASE_KINDS.map((value) => ({
  value,
  label: value,
}));
export const SUPPLY_COMMITMENT_UNIT_OPTIONS = UNITS.map((value) => ({
  value,
  label: UNIT_LABEL_VI[value],
}));
