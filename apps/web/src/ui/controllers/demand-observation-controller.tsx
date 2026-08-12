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
  isObservationFactAllowed,
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
import { useDebounced } from "@/api/use-debounced.ts";
import { formatQuantityInput, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { formatVietnamDateTimeLocal, parseVietnamDateTimeLocal } from "@/ui/domain/time.ts";
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
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [qualityGradeSearch, setQualityGradeSearch] = useState("");
  const customers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: useDebounced(customerSearch, 250),
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: useDebounced(productSearch, 250),
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const grades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: useDebounced(qualityGradeSearch, 250),
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const mutation = useMutation(trpc.evidence.recordDemandObservation.mutationOptions());
  const command = useContractCommand(recordDemandObservationCommandSchema, mutation.mutateAsync);
  const observationId = useRef(crypto.randomUUID() as DemandObservationId);
  const [customerId, setCustomerId] = useState<CustomerId | "">("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [productId, setProductId] = useState<ProductId | "">("");
  const [productLabel, setProductLabel] = useState("");
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | "">("");
  const [qualityGradeLabel, setQualityGradeLabel] = useState("");
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
  const [relatedObservationId, setRelatedObservationId] = useState<DemandObservationId | "">("");
  const [relatedObservationLabel, setRelatedObservationLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setFormError(null);
    const requested = parseQuantityFor("requestedQuantity", requestedQuantity, unit, kind);
    if (!requested.ok) return setFormError(requested.reason);
    const minimum = parseQuantityFor("minimumQuantity", minimumQuantity, unit, kind);
    if (!minimum.ok) return setFormError(minimum.reason);
    const parsedRequestedFor = isObservationFactAllowed("demand", kind, "requestedForAt")
      ? parseOptionalInstant(requestedForAt)
      : { ok: true as const, value: null };
    if (!parsedRequestedFor.ok) return setFormError(parsedRequestedFor.reason);
    const references = evidenceReferences
      .split("\n")
      .map((reference) => reference.trim())
      .filter(Boolean);
    if (references.length === 0) return setFormError("Cần ít nhất một tham chiếu nguồn.");
    if (caseKind === "correction" && relatedObservationId === "") {
      return setFormError("Chọn bản ghi cần điều chỉnh trong lịch sử bên dưới.");
    }
    const result = await command.submit({
      demandObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        customerId: fact(kind, "customerId", customerId === "" ? null : customerId),
        productId: fact(kind, "productId", productId === "" ? null : productId),
        qualityGradeId: fact(kind, "qualityGradeId", qualityGradeId === "" ? null : qualityGradeId),
        requestedQuantity: fact(kind, "requestedQuantity", requested.value),
        minimumQuantity: fact(kind, "minimumQuantity", minimum.value),
        requestedForAt: fact(kind, "requestedForAt", parsedRequestedFor.value),
        counterpartyLabel: fact(kind, "counterpartyLabel", counterpartyLabel.trim() || null),
        demandReference: fact(kind, "demandReference", demandReference.trim() || null),
      },
      evidenceReferences: references,
      relatedObservationId: relatedObservationId === "" ? null : relatedObservationId,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as DemandObservationId;
    setCustomerId("");
    setCustomerLabel("");
    setProductId("");
    setProductLabel("");
    setQualityGradeId("");
    setQualityGradeLabel("");
    setDescription("");
    setParticipantWording("");
    setCounterpartyLabel("");
    setRequestedQuantity("");
    setMinimumQuantity("");
    setRequestedForAt("");
    setDemandReference("");
    setEvidenceReferences("");
    setRelatedObservationId("");
    setRelatedObservationLabel("");
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
      customerSearch={customerSearch}
      productSearch={productSearch}
      qualityGradeSearch={qualityGradeSearch}
      customerOptions={withSelectedOption(
        (customers.data?.items ?? []).map((item) => ({ value: item.id, label: item.displayName })),
        customerId,
        customerLabel,
      )}
      productOptions={withSelectedOption(
        (products.data?.items ?? []).map((item) => ({ value: item.id, label: item.displayName })),
        productId,
        productLabel,
      )}
      qualityGradeOptions={withSelectedOption(
        (grades.data?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
        qualityGradeId,
        qualityGradeLabel,
      )}
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
      relatedObservationLabel={relatedObservationLabel}
      formError={formError}
      command={command}
      onCustomerId={(value) => {
        setCustomerId(value as CustomerId | "");
        setCustomerLabel(
          value === ""
            ? ""
            : (customers.data?.items.find((item) => item.id === value)?.displayName ??
                customerLabel),
        );
      }}
      onProductId={(value) => {
        setProductId(value as ProductId | "");
        setProductLabel(
          value === ""
            ? ""
            : (products.data?.items.find((item) => item.id === value)?.displayName ?? productLabel),
        );
      }}
      onQualityGradeId={(value) => {
        setQualityGradeId(value as QualityGradeId | "");
        setQualityGradeLabel(
          value === ""
            ? ""
            : (grades.data?.items.find((item) => item.id === value)?.name ?? qualityGradeLabel),
        );
      }}
      onCustomerSearch={setCustomerSearch}
      onProductSearch={setProductSearch}
      onQualityGradeSearch={setQualityGradeSearch}
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
      onStartCorrection={(id, label) => {
        const item = observations.data?.items.find((candidate) => candidate.id === id);
        if (item === undefined) return;
        setCaseKind("correction");
        setRelatedObservationId(demandObservationIdSchema.parse(id));
        setRelatedObservationLabel(label);
        setKind(item.kind);
        setDescription(item.description);
        setParticipantWording(item.participantWording);
        setCustomerId(item.facts.customerId ?? "");
        setProductId(item.facts.productId ?? "");
        setQualityGradeId(item.facts.qualityGradeId ?? "");
        setRequestedQuantity(
          item.facts.requestedQuantity === null
            ? ""
            : formatQuantityInput(item.facts.requestedQuantity),
        );
        setMinimumQuantity(
          item.facts.minimumQuantity === null
            ? ""
            : formatQuantityInput(item.facts.minimumQuantity),
        );
        setUnit(item.facts.requestedQuantity?.unit ?? item.facts.minimumQuantity?.unit ?? "kg");
        setRequestedForAt(
          item.facts.requestedForAt === null
            ? ""
            : formatVietnamDateTimeLocal(item.facts.requestedForAt),
        );
        setCounterpartyLabel(item.facts.counterpartyLabel ?? "");
        setDemandReference(item.facts.demandReference ?? "");
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

function withSelectedOption(
  options: readonly { value: string; label: string }[],
  selectedValue: string,
  selectedLabel: string,
): readonly { value: string; label: string }[] {
  if (selectedValue === "" || options.some((option) => option.value === selectedValue)) {
    return options;
  }
  return [{ value: selectedValue, label: selectedLabel || "Đã chọn" }, ...options];
}

function parseOptionalQuantity(raw: string, unit: Unit) {
  if (raw.trim().length === 0) return { ok: true as const, value: null };
  return parseQuantityText(raw, unit);
}

function parseQuantityFor(fact: string, raw: string, unit: Unit, kind: DemandObservationKind) {
  return isObservationFactAllowed("demand", kind, fact)
    ? parseOptionalQuantity(raw, unit)
    : { ok: true as const, value: null };
}

function fact<T>(kind: DemandObservationKind, name: string, value: T): T | null {
  return isObservationFactAllowed("demand", kind, name) ? value : null;
}

function parseOptionalInstant(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true as const, value: null };
  return parseVietnamDateTimeLocal(trimmed, "Thời điểm nhu cầu");
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
