"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  COST_OBSERVATION_CASE_KINDS,
  DEMAND_OBSERVATION_KINDS,
  UNIT_LABEL_VI,
  UNITS,
  demandObservationIdSchema,
  demandObservationKindSchema,
  recordDemandObservationCommandSchema,
  type CostObservationCaseKind,
  type CustomerId,
  type DemandObservationId,
  type DemandObservationKind,
  type ProductId,
  type QualityGradeId,
  type Unit,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { DemandObservationView } from "@/ui/screens/demand-observation-view.tsx";

export function DemandObservationController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const observations = useQuery(
    trpc.evidence.listDemandObservations.queryOptions({
      workspaceId,
      kind: null,
      cursor: null,
      limit: 50,
    }),
  );
  const customers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: "",
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: "",
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const grades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: "",
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const mutation = useMutation(trpc.evidence.recordDemandObservation.mutationOptions());
  const command = useContractCommand(recordDemandObservationCommandSchema, mutation.mutateAsync);
  const observationId = useRef(crypto.randomUUID() as DemandObservationId);
  const [customerId, setCustomerId] = useState<CustomerId | "">("");
  const [productId, setProductId] = useState<ProductId | "">("");
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | "">("");
  const [kind, setKind] = useState<DemandObservationKind>("requested_order");
  const [caseKind, setCaseKind] = useState<CostObservationCaseKind>("normal");
  const [description, setDescription] = useState("");
  const [participantWording, setParticipantWording] = useState("");
  const [counterpartyLabel, setCounterpartyLabel] = useState("");
  const [requestedQuantity, setRequestedQuantity] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("");
  const [requestedForAt, setRequestedForAt] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [demandReference, setDemandReference] = useState("");
  const [evidenceReferences, setEvidenceReferences] = useState("");
  const [relatedObservationId, setRelatedObservationId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setFormError(null);
    const requested = parseOptionalQuantity(requestedQuantity, unit);
    if (!requested.ok) return setFormError(requested.reason);
    const minimum = parseOptionalQuantity(minimumQuantity, unit);
    if (!minimum.ok) return setFormError(minimum.reason);
    const parsedRequestedFor = parseOptionalInstant(requestedForAt);
    if (!parsedRequestedFor.ok) return setFormError(parsedRequestedFor.reason);
    const references = evidenceReferences
      .split("\n")
      .map((reference) => reference.trim())
      .filter(Boolean);
    if (references.length === 0) return setFormError("Cần ít nhất một tham chiếu nguồn.");
    const relatedText = relatedObservationId.trim();
    const parsedRelated =
      relatedText.length === 0 ? null : demandObservationIdSchema.safeParse(relatedText);
    if (parsedRelated !== null && !parsedRelated.success) {
      return setFormError("ID quan sát điều chỉnh không hợp lệ.");
    }
    const result = await command.submit({
      demandObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        customerId: customerId === "" ? null : customerId,
        productId: productId === "" ? null : productId,
        qualityGradeId: qualityGradeId === "" ? null : qualityGradeId,
        requestedQuantity: requested.value,
        minimumQuantity: minimum.value,
        requestedForAt: parsedRequestedFor.value,
        counterpartyLabel: counterpartyLabel.trim() || null,
        demandReference: demandReference.trim() || null,
      },
      evidenceReferences: references,
      relatedObservationId: parsedRelated === null ? null : parsedRelated.data,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as DemandObservationId;
    setCustomerId("");
    setProductId("");
    setQualityGradeId("");
    setDescription("");
    setParticipantWording("");
    setCounterpartyLabel("");
    setRequestedQuantity("");
    setMinimumQuantity("");
    setRequestedForAt("");
    setDemandReference("");
    setEvidenceReferences("");
    setRelatedObservationId("");
    await observations.refetch();
  }

  return (
    <DemandObservationView
      canRecord={session.permissions.includes("evidence.record")}
      query={observations}
      items={observations.data?.items ?? []}
      customerId={customerId}
      productId={productId}
      qualityGradeId={qualityGradeId}
      customerOptions={(customers.data?.items ?? []).map((item) => ({
        value: item.id,
        label: item.displayName,
      }))}
      productOptions={(products.data?.items ?? []).map((item) => ({
        value: item.id,
        label: item.displayName,
      }))}
      qualityGradeOptions={(grades.data?.items ?? []).map((item) => ({
        value: item.id,
        label: item.name,
      }))}
      kind={kind}
      caseKind={caseKind}
      description={description}
      participantWording={participantWording}
      counterpartyLabel={counterpartyLabel}
      requestedQuantity={requestedQuantity}
      minimumQuantity={minimumQuantity}
      requestedForAt={requestedForAt}
      unit={unit}
      demandReference={demandReference}
      evidenceReferences={evidenceReferences}
      relatedObservationId={relatedObservationId}
      formError={formError}
      command={command}
      onCustomerId={(value) => setCustomerId(value as CustomerId | "")}
      onProductId={(value) => setProductId(value as ProductId | "")}
      onQualityGradeId={(value) => setQualityGradeId(value as QualityGradeId | "")}
      onKind={(value) => setKind(demandObservationKindSchema.parse(value))}
      onCaseKind={setCaseKind}
      onDescription={setDescription}
      onParticipantWording={setParticipantWording}
      onCounterpartyLabel={setCounterpartyLabel}
      onRequestedQuantity={setRequestedQuantity}
      onMinimumQuantity={setMinimumQuantity}
      onRequestedForAt={setRequestedForAt}
      onUnit={setUnit}
      onDemandReference={setDemandReference}
      onEvidenceReferences={setEvidenceReferences}
      onRelatedObservationId={setRelatedObservationId}
      onSubmit={() => void submit()}
      onRetry={() => void observations.refetch()}
    />
  );
}

function parseOptionalQuantity(raw: string, unit: Unit) {
  if (raw.trim().length === 0) return { ok: true as const, value: null };
  return parseQuantityText(raw, unit);
}

function parseOptionalInstant(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true as const, value: null };
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime())
    ? { ok: false as const, reason: "Thời điểm nhu cầu không hợp lệ." }
    : { ok: true as const, value: date.toISOString() };
}

export const DEMAND_OBSERVATION_KIND_OPTIONS = DEMAND_OBSERVATION_KINDS.map((value) => ({
  value,
  label: value,
}));
export const DEMAND_OBSERVATION_CASE_OPTIONS = COST_OBSERVATION_CASE_KINDS.map((value) => ({
  value,
  label: value,
}));
export const DEMAND_OBSERVATION_UNIT_OPTIONS = UNITS.map((value) => ({
  value,
  label: UNIT_LABEL_VI[value],
}));
