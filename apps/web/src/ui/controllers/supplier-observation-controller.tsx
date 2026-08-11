"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  COST_OBSERVATION_CASE_KINDS,
  SUPPLIER_OBSERVATION_KINDS,
  UNITS,
  UNIT_LABEL_VI,
  recordSupplierObservationCommandSchema,
  supplierObservationIdSchema,
  supplierObservationKindSchema,
  type ProductId,
  type QualityGradeId,
  type SupplierId,
  type CostObservationCaseKind,
  type SupplierObservationId,
  type SupplierObservationKind,
  type Unit,
} from "@vuarau/domain-contracts";
import { useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import {
  formatMoneyInput,
  formatQuantityInput,
  parseMoneyText,
  parseQuantityText,
} from "@/ui/domain/numeric-text.ts";
import { supplierObservationHasField } from "@/ui/domain/supplier-observation-fields.ts";
import { formatVietnamDateTimeLocal, parseVietnamDateTimeLocal } from "@/ui/domain/time.ts";
import { formatInstant } from "@/ui/format.ts";
import { SupplierObservationView } from "@/ui/screens/supplier-observation-view.tsx";

export function SupplierObservationController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.evidence.listSupplierObservations.queryOptions({
      workspaceId,
      kind: null,
      cursor: null,
      limit: 50,
    }),
  );
  const mutation = useMutation(trpc.evidence.recordSupplierObservation.mutationOptions());
  const command = useContractCommand(recordSupplierObservationCommandSchema, mutation.mutateAsync);
  const observationId = useRef(crypto.randomUUID() as SupplierObservationId);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [qualityGradeSearch, setQualityGradeSearch] = useState("");
  const suppliers = useQuery(
    trpc.supplier.search.queryOptions({
      workspaceId,
      query: useDebounced(supplierSearch, 250),
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
  const qualityGrades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: useDebounced(qualityGradeSearch, 250),
      isActive: null,
      cursor: null,
      limit: 100,
    }),
  );
  const [supplierId, setSupplierId] = useState<SupplierId | "">("");
  const [productId, setProductId] = useState<ProductId | "">("");
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | "">("");
  const [kind, setKind] = useState<SupplierObservationKind>("role");
  const [caseKind, setCaseKind] = useState<CostObservationCaseKind>("normal");
  const [description, setDescription] = useState("");
  const [participantWording, setParticipantWording] = useState("");
  const [role, setRole] = useState("");
  const [sourceArea, setSourceArea] = useState("");
  const [pickupResponsibility, setPickupResponsibility] = useState("");
  const [packingResponsibility, setPackingResponsibility] = useState("");
  const [transportResponsibility, setTransportResponsibility] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [paymentArrangement, setPaymentArrangement] = useState("");
  const [traceabilityLevel, setTraceabilityLevel] = useState("");
  const [promisedQuantity, setPromisedQuantity] = useState("");
  const [actualQuantity, setActualQuantity] = useState("");
  const [acceptedQuantity, setAcceptedQuantity] = useState("");
  const [rejectedQuantity, setRejectedQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [expectedAt, setExpectedAt] = useState("");
  const [actualAt, setActualAt] = useState("");
  const [price, setPrice] = useState("");
  const [claimReference, setClaimReference] = useState("");
  const [evidenceReferences, setEvidenceReferences] = useState("");
  const [relatedObservationId, setRelatedObservationId] = useState<SupplierObservationId | "">("");
  const [relatedObservationLabel, setRelatedObservationLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    const promised = parseOptionalQuantity(promisedQuantity, unit);
    if (!promised.ok) return setFormError(promised.reason);
    const actual = parseOptionalQuantity(actualQuantity, unit);
    if (!actual.ok) return setFormError(actual.reason);
    const accepted = parseOptionalQuantity(acceptedQuantity, unit);
    if (!accepted.ok) return setFormError(accepted.reason);
    const rejected = parseOptionalQuantity(rejectedQuantity, unit);
    if (!rejected.ok) return setFormError(rejected.reason);
    const parsedPrice = parseMoneyText(price, "VND");
    if (!parsedPrice.ok) return setFormError(parsedPrice.reason);
    const references = evidenceReferences
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (references.length === 0) return setFormError("Cần ít nhất một tham chiếu nguồn.");
    if (caseKind === "correction" && relatedObservationId === "")
      return setFormError("Chọn bản ghi cần điều chỉnh trong lịch sử bên dưới.");
    const parsedExpectedAt = parseOptionalInstant(expectedAt);
    if (!parsedExpectedAt.ok) return setFormError(parsedExpectedAt.reason);
    const parsedActualAt = parseOptionalInstant(actualAt);
    if (!parsedActualAt.ok) return setFormError(parsedActualAt.reason);
    const fact = <T,>(
      field: Parameters<typeof supplierObservationHasField>[1],
      value: T,
    ): T | null => (supplierObservationHasField(kind, field) ? value : null);
    const result = await command.submit({
      supplierObservationId: observationId.current,
      kind,
      caseKind,
      description,
      participantWording,
      facts: {
        supplierId: supplierId === "" ? null : supplierId,
        productId: fact("product", productId === "" ? null : productId),
        qualityGradeId: fact("qualityGrade", qualityGradeId === "" ? null : qualityGradeId),
        supplierObservationGroupId: null,
        role: fact("role", role.trim() || null),
        sourceArea: fact("sourceArea", sourceArea.trim() || null),
        pickupResponsibility: fact("pickupResponsibility", pickupResponsibility.trim() || null),
        packingResponsibility: fact("packingResponsibility", packingResponsibility.trim() || null),
        transportResponsibility: fact(
          "transportResponsibility",
          transportResponsibility.trim() || null,
        ),
        expectedLeadTimeText: fact("leadTime", leadTime.trim() || null),
        paymentArrangement: fact("paymentArrangement", paymentArrangement.trim() || null),
        traceabilityLevel: fact("traceabilityLevel", traceabilityLevel.trim() || null),
        promisedQuantity: fact("quantity", promised.value),
        actualQuantity: fact("quantity", actual.value),
        acceptedQuantity: fact("quantity", accepted.value),
        rejectedQuantity: fact("quantity", rejected.value),
        expectedAt: fact("expectedAt", parsedExpectedAt.value),
        actualAt: fact("actualAt", parsedActualAt.value),
        price: fact("price", parsedPrice.value),
        claimReference: fact("claim", claimReference.trim() || null),
        observationReference: null,
      },
      evidenceReferences: references,
      relatedObservationId: relatedObservationId === "" ? null : relatedObservationId,
    });
    if (result === null) return;
    observationId.current = crypto.randomUUID() as SupplierObservationId;
    setDescription("");
    setParticipantWording("");
    setSupplierId("");
    setProductId("");
    setQualityGradeId("");
    setRole("");
    setSourceArea("");
    setPickupResponsibility("");
    setPackingResponsibility("");
    setTransportResponsibility("");
    setLeadTime("");
    setPaymentArrangement("");
    setTraceabilityLevel("");
    setPromisedQuantity("");
    setActualQuantity("");
    setAcceptedQuantity("");
    setRejectedQuantity("");
    setExpectedAt("");
    setActualAt("");
    setPrice("");
    setClaimReference("");
    setEvidenceReferences("");
    setRelatedObservationId("");
    setRelatedObservationLabel("");
    await query.refetch();
  }

  return (
    <SupplierObservationView
      canRecord={session.permissions.includes("evidence.record")}
      query={query}
      items={query.data?.items ?? []}
      supplierId={supplierId}
      productId={productId}
      qualityGradeId={qualityGradeId}
      supplierSearch={supplierSearch}
      productSearch={productSearch}
      qualityGradeSearch={qualityGradeSearch}
      supplierOptions={(suppliers.data?.items ?? []).map((item) => ({
        value: item.id,
        label: item.displayName,
      }))}
      productOptions={(products.data?.items ?? []).map((item) => ({
        value: item.id,
        label: item.displayName,
      }))}
      qualityGradeOptions={(qualityGrades.data?.items ?? []).map((item) => ({
        value: item.id,
        label: item.name,
      }))}
      kind={kind}
      caseKind={caseKind}
      description={description}
      participantWording={participantWording}
      role={role}
      sourceArea={sourceArea}
      pickupResponsibility={pickupResponsibility}
      packingResponsibility={packingResponsibility}
      transportResponsibility={transportResponsibility}
      leadTime={leadTime}
      paymentArrangement={paymentArrangement}
      traceabilityLevel={traceabilityLevel}
      promisedQuantity={promisedQuantity}
      actualQuantity={actualQuantity}
      acceptedQuantity={acceptedQuantity}
      rejectedQuantity={rejectedQuantity}
      unit={unit}
      expectedAt={expectedAt}
      actualAt={actualAt}
      price={price}
      claimReference={claimReference}
      evidenceReferences={evidenceReferences}
      relatedObservationLabel={relatedObservationLabel}
      formError={formError}
      command={command}
      onKind={(value) => setKind(supplierObservationKindSchema.parse(value))}
      onCaseKind={setCaseKind}
      onDescription={setDescription}
      onParticipantWording={setParticipantWording}
      onSupplierId={(value) => setSupplierId(value as SupplierId | "")}
      onProductId={(value) => setProductId(value as ProductId | "")}
      onQualityGradeId={(value) => setQualityGradeId(value as QualityGradeId | "")}
      onSupplierSearch={setSupplierSearch}
      onProductSearch={setProductSearch}
      onQualityGradeSearch={setQualityGradeSearch}
      onRole={setRole}
      onSourceArea={setSourceArea}
      onPickupResponsibility={setPickupResponsibility}
      onPackingResponsibility={setPackingResponsibility}
      onTransportResponsibility={setTransportResponsibility}
      onLeadTime={setLeadTime}
      onPaymentArrangement={setPaymentArrangement}
      onTraceabilityLevel={setTraceabilityLevel}
      onPromisedQuantity={setPromisedQuantity}
      onActualQuantity={setActualQuantity}
      onAcceptedQuantity={setAcceptedQuantity}
      onRejectedQuantity={setRejectedQuantity}
      onUnit={setUnit}
      onExpectedAt={setExpectedAt}
      onActualAt={setActualAt}
      onPrice={setPrice}
      onClaimReference={setClaimReference}
      onEvidenceReferences={setEvidenceReferences}
      onStartCorrection={(item) => {
        const facts = item.facts;
        setKind(item.kind);
        setCaseKind("correction");
        setDescription(item.description);
        setParticipantWording(item.participantWording);
        setEvidenceReferences(item.evidenceReferences.join("\n"));
        setSupplierId((facts.supplierId as SupplierId | null) ?? "");
        setProductId((facts.productId as ProductId | null) ?? "");
        setQualityGradeId((facts.qualityGradeId as QualityGradeId | null) ?? "");
        setRole(facts.role ?? "");
        setSourceArea(facts.sourceArea ?? "");
        setPickupResponsibility(facts.pickupResponsibility ?? "");
        setPackingResponsibility(facts.packingResponsibility ?? "");
        setTransportResponsibility(facts.transportResponsibility ?? "");
        setLeadTime(facts.expectedLeadTimeText ?? "");
        setPaymentArrangement(facts.paymentArrangement ?? "");
        setTraceabilityLevel(facts.traceabilityLevel ?? "");
        const firstQuantity =
          facts.promisedQuantity ??
          facts.actualQuantity ??
          facts.acceptedQuantity ??
          facts.rejectedQuantity;
        setUnit(firstQuantity?.unit ?? "kg");
        setPromisedQuantity(
          facts.promisedQuantity === null ? "" : formatQuantityInput(facts.promisedQuantity),
        );
        setActualQuantity(
          facts.actualQuantity === null ? "" : formatQuantityInput(facts.actualQuantity),
        );
        setAcceptedQuantity(
          facts.acceptedQuantity === null ? "" : formatQuantityInput(facts.acceptedQuantity),
        );
        setRejectedQuantity(
          facts.rejectedQuantity === null ? "" : formatQuantityInput(facts.rejectedQuantity),
        );
        setExpectedAt(
          facts.expectedAt === null ? "" : formatVietnamDateTimeLocal(facts.expectedAt),
        );
        setActualAt(facts.actualAt === null ? "" : formatVietnamDateTimeLocal(facts.actualAt));
        setPrice(facts.price === null ? "" : formatMoneyInput(facts.price));
        setClaimReference(facts.claimReference ?? "");
        setRelatedObservationId(supplierObservationIdSchema.parse(item.id));
        setRelatedObservationLabel(`Bản ghi ngày ${formatInstant(item.transactionTime)}`);
      }}
      onClearCorrection={() => {
        setRelatedObservationId("");
        setRelatedObservationLabel("");
      }}
      onSubmit={() => void submit()}
      onRetry={() => void query.refetch()}
    />
  );
}

function parseOptionalQuantity(raw: string, unit: Unit) {
  if (raw.trim().length === 0) return { ok: true as const, value: null };
  return parseQuantityText(raw, unit);
}

function parseOptionalInstant(raw: string) {
  const value = raw.trim();
  if (value.length === 0) return { ok: true as const, value: null };
  return parseVietnamDateTimeLocal(value, "Thời điểm quan sát");
}

export const SUPPLIER_OBSERVATION_KIND_OPTIONS = SUPPLIER_OBSERVATION_KINDS.map((value) => ({
  value,
  label: value,
}));
export const SUPPLIER_OBSERVATION_CASE_OPTIONS = COST_OBSERVATION_CASE_KINDS.map((value) => ({
  value,
  label: value,
}));
export const SUPPLIER_OBSERVATION_UNIT_OPTIONS = UNITS.map((value) => ({
  value,
  label: UNIT_LABEL_VI[value],
}));
