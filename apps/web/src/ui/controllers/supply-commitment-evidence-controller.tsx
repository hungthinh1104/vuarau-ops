"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  COST_OBSERVATION_CASE_KINDS,
  SUPPLY_COMMITMENT_OBSERVATION_KINDS,
  UNIT_LABEL_VI,
  UNITS,
  recordSupplyCommitmentObservationCommandSchema,
  isObservationFactAllowed,
  supplyCommitmentObservationIdSchema,
  supplyCommitmentObservationKindSchema,
  type CostObservationCaseKind,
  type ProductId,
  type QualityGradeId,
  type SupplierId,
  type SupplyCommitmentObservationId,
  type SupplyCommitmentObservationKind,
  type Unit,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { formatQuantityInput, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { formatVietnamDateTimeLocal, parseVietnamDateTimeLocal } from "@/ui/domain/time.ts";
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
  const [supplierId, setSupplierId] = useState<SupplierId | null>(null);
  const [productId, setProductId] = useState<ProductId | null>(null);
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | null>(null);
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
    const promised = parseQuantityFor("promisedQuantity", promisedQuantity, unit, kind);
    const minimum = parseQuantityFor("minimumOrder", minimumOrder, unit, kind);
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
    const parsedArrival = isObservationFactAllowed("supply", kind, "expectedArrivalAt")
      ? parseOptionalInstant(expectedArrivalAt)
      : { ok: true as const, value: null };
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
        supplierId: fact(kind, "supplierId", supplierId),
        productId: fact(kind, "productId", productId),
        qualityGradeId: fact(kind, "qualityGradeId", qualityGradeId),
        promisedQuantity: fact(kind, "promisedQuantity", promised.value),
        minimumOrder: fact(kind, "minimumOrder", minimum.value),
        expectedArrivalAt: fact(kind, "expectedArrivalAt", parsedArrival.value),
        counterpartyLabel: fact(kind, "counterpartyLabel", counterpartyLabel.trim() || null),
        commitmentReference: fact(kind, "commitmentReference", commitmentReference.trim() || null),
      },
      evidenceReferences: references,
      relatedObservationId: relatedObservationId === "" ? null : relatedObservationId,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as SupplyCommitmentObservationId;
    setDescription("");
    setParticipantWording("");
    setSupplierId(null);
    setProductId(null);
    setQualityGradeId(null);
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
        const item = observations.data?.items.find((candidate) => candidate.id === id);
        if (item === undefined) return;
        setCaseKind("correction");
        setRelatedObservationId(supplyCommitmentObservationIdSchema.parse(id));
        setRelatedObservationLabel(label);
        setKind(item.kind);
        setDescription(item.description);
        setParticipantWording(item.participantWording);
        setSupplierId(item.facts.supplierId);
        setProductId(item.facts.productId);
        setQualityGradeId(item.facts.qualityGradeId);
        setCounterpartyLabel(item.facts.counterpartyLabel ?? "");
        setPromisedQuantity(
          item.facts.promisedQuantity === null
            ? ""
            : formatQuantityInput(item.facts.promisedQuantity),
        );
        setMinimumOrder(
          item.facts.minimumOrder === null ? "" : formatQuantityInput(item.facts.minimumOrder),
        );
        setUnit(item.facts.promisedQuantity?.unit ?? item.facts.minimumOrder?.unit ?? "kg");
        setExpectedArrivalAt(
          item.facts.expectedArrivalAt === null
            ? ""
            : formatVietnamDateTimeLocal(item.facts.expectedArrivalAt),
        );
        setCommitmentReference(item.facts.commitmentReference ?? "");
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

function parseOptionalInstant(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true as const, value: null };
  return parseVietnamDateTimeLocal(trimmed, "Ngày giờ dự kiến");
}

function parseQuantityFor(
  factName: string,
  raw: string,
  unit: Unit,
  kind: SupplyCommitmentObservationKind,
) {
  if (!isObservationFactAllowed("supply", kind, factName)) {
    return { ok: true as const, value: null };
  }
  if (raw.trim().length === 0) return { ok: true as const, value: null };
  return parseQuantityText(raw, unit);
}

function fact<T>(kind: SupplyCommitmentObservationKind, name: string, value: T): T | null {
  return isObservationFactAllowed("supply", kind, name) ? value : null;
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
