import type {
  CostObservationKind,
  DebtObservationKind,
  DemandObservationKind,
  ReconciliationObservationKind,
  SupplierObservationKind,
  SupplyCommitmentObservationKind,
} from "@vuarau/domain-contracts";
import { isObservationFactAllowed, type ObservationFactFamily } from "@vuarau/domain-contracts";

export type ObservationFactField =
  | "amount"
  | "quantity"
  | "expectedAmount"
  | "observedAmount"
  | "expectedQuantity"
  | "observedQuantity"
  | "itemCount"
  | "date"
  | "party"
  | "product"
  | "reference";

export type ObservationFormContract = {
  readonly fields: readonly ObservationFactField[];
  readonly hint: string;
};

/**
 * The only UI mapping from an observation kind to visible fact fields. The
 * backend contracts remain authoritative; this registry only prevents a worker
 * from filling unrelated money/quantity fields for an observation.
 */
export const OBSERVATION_FORM_REGISTRY = {
  cost_observation: {
    purchase_price: { fields: ["amount"], hint: "Chỉ ghi giá mua nhìn thấy trên nguồn." },
    accepted_quantity: {
      fields: ["quantity", "product"],
      hint: "Chỉ ghi lượng hàng đạt đã quan sát.",
    },
    rejected_quantity: {
      fields: ["quantity", "product"],
      hint: "Chỉ ghi lượng hàng không đạt đã quan sát.",
    },
    packing_material: {
      fields: ["amount", "quantity"],
      hint: "Chỉ ghi chi phí hoặc lượng bao bì nhìn thấy.",
    },
    labor_handling: { fields: ["amount"], hint: "Chỉ ghi chi phí công hoặc xử lý đã quan sát." },
    transport: { fields: ["amount"], hint: "Chỉ ghi chi phí vận chuyển đã quan sát." },
    spoilage: {
      fields: ["quantity", "product"],
      hint: "Chỉ ghi lượng hao hụt hoặc hư hỏng đã thấy.",
    },
    damage: { fields: ["quantity", "product"], hint: "Chỉ ghi lượng hàng hư hại đã thấy." },
    customer_return: {
      fields: ["quantity", "product"],
      hint: "Chỉ ghi lượng khách trả đã nhận thấy.",
    },
    supplier_claim: {
      fields: ["reference"],
      hint: "Chỉ ghi tham chiếu khiếu nại, chưa kết luận tiền.",
    },
    supplier_credit: { fields: ["amount", "reference"], hint: "Chỉ ghi khoản ghi có trên nguồn." },
    other: {
      fields: ["amount", "quantity", "reference"],
      hint: "Chỉ ghi những gì nguồn thể hiện.",
    },
  } satisfies Record<CostObservationKind, ObservationFormContract>,
  reconciliation_observation: {
    cash_count: {
      fields: ["expectedAmount", "observedAmount", "itemCount"],
      hint: "Đối chiếu tiền mặt và số dòng đếm.",
    },
    inventory_count: {
      fields: ["expectedQuantity", "observedQuantity", "itemCount", "product"],
      hint: "Đối chiếu lượng hàng và số dòng đếm.",
    },
    order_outstanding: {
      fields: ["expectedQuantity", "observedQuantity", "itemCount", "reference"],
      hint: "Đối chiếu phần đơn còn lại.",
    },
    delivery_outstanding: {
      fields: ["expectedQuantity", "observedQuantity", "itemCount", "reference"],
      hint: "Đối chiếu phần giao còn lại.",
    },
    return_outstanding: {
      fields: ["expectedQuantity", "observedQuantity", "itemCount", "reference"],
      hint: "Đối chiếu phần hàng trả còn lại.",
    },
    claim_outstanding: {
      fields: ["expectedAmount", "observedAmount", "itemCount", "reference"],
      hint: "Đối chiếu phần khiếu nại còn lại.",
    },
    packing_discrepancy: {
      fields: ["expectedQuantity", "observedQuantity", "itemCount", "reference"],
      hint: "Đối chiếu sai khác đóng gói.",
    },
    bank_statement_match: {
      fields: ["expectedAmount", "observedAmount", "reference"],
      hint: "Đối chiếu số tiền với sao kê.",
    },
    other: {
      fields: [
        "expectedAmount",
        "observedAmount",
        "expectedQuantity",
        "observedQuantity",
        "itemCount",
        "reference",
      ],
      hint: "Chỉ ghi hai phía của điều cần đối chiếu.",
    },
  } satisfies Record<ReconciliationObservationKind, ObservationFormContract>,
  debt_observation: {
    agreed_due_date: {
      fields: ["date", "party", "reference"],
      hint: "Ghi ngày hẹn và nguồn trao đổi.",
    },
    payment_term: {
      fields: ["amount", "date", "reference"],
      hint: "Ghi điều khoản được quan sát.",
    },
    promise_to_pay: {
      fields: ["amount", "date", "party", "reference"],
      hint: "Ghi lời hẹn trả và nguồn.",
    },
    collection_note: { fields: ["party", "reference"], hint: "Ghi nội dung thu hồi công nợ." },
    payment_reference: {
      fields: ["amount", "reference"],
      hint: "Ghi số tiền và nguồn thanh toán.",
    },
    allocation_proposal: {
      fields: ["amount", "reference"],
      hint: "Ghi đề xuất phân bổ, chưa thay đổi sổ.",
    },
    customer_credit_preserved: {
      fields: ["amount", "reference"],
      hint: "Xác nhận khoản Payment còn lại được giữ nguyên là tín dụng khách hàng.",
    },
    other: { fields: ["amount", "date", "party", "reference"], hint: "Chỉ ghi điều đã quan sát." },
  } satisfies Record<DebtObservationKind, ObservationFormContract>,
  supply_commitment_observation: {
    promised_supply: {
      fields: ["quantity", "date", "party", "product", "reference"],
      hint: "Ghi lượng nguồn cung được hứa.",
    },
    expected_arrival: {
      fields: ["date", "party", "product", "reference"],
      hint: "Ghi thời điểm hàng được hẹn đến.",
    },
    minimum_order: {
      fields: ["quantity", "party", "product", "reference"],
      hint: "Ghi số lượng tối thiểu được nói tới.",
    },
    availability_note: {
      fields: ["party", "product", "reference"],
      hint: "Ghi thông tin sẵn có từ nguồn.",
    },
    other: {
      fields: ["quantity", "date", "party", "product", "reference"],
      hint: "Chỉ ghi điều đã quan sát.",
    },
  } satisfies Record<SupplyCommitmentObservationKind, ObservationFormContract>,
  supplier_observation: {
    role: { fields: ["party", "reference"], hint: "Ghi vai trò được quan sát." },
    product_supplied: {
      fields: ["product", "reference"],
      hint: "Ghi mặt hàng nhà cung cấp cung ứng.",
    },
    source_area: { fields: ["party", "reference"], hint: "Ghi vùng nguồn được nói tới." },
    pickup_responsibility: { fields: ["party", "reference"], hint: "Ghi trách nhiệm lấy hàng." },
    packing_responsibility: { fields: ["party", "reference"], hint: "Ghi trách nhiệm đóng gói." },
    transport_responsibility: {
      fields: ["party", "reference"],
      hint: "Ghi trách nhiệm vận chuyển.",
    },
    expected_lead_time: { fields: ["date", "reference"], hint: "Ghi thời gian giao dự kiến." },
    payment_arrangement: {
      fields: ["amount", "party", "reference"],
      hint: "Ghi cách thanh toán được nói tới.",
    },
    traceability_level: { fields: ["reference"], hint: "Ghi mức truy xuất được quan sát." },
    promised_quantity: {
      fields: ["quantity", "product", "reference"],
      hint: "Ghi lượng được hứa.",
    },
    actual_quantity: {
      fields: ["quantity", "product", "reference"],
      hint: "Ghi lượng thực tế quan sát.",
    },
    expected_arrival: { fields: ["date", "reference"], hint: "Ghi thời điểm dự kiến." },
    actual_arrival: { fields: ["date", "reference"], hint: "Ghi thời điểm thực tế." },
    accepted_quantity: {
      fields: ["quantity", "product", "reference"],
      hint: "Ghi lượng được nhận đạt.",
    },
    rejected_quantity: {
      fields: ["quantity", "product", "reference"],
      hint: "Ghi lượng bị trả hoặc không đạt.",
    },
    claim: { fields: ["reference"], hint: "Ghi tham chiếu khiếu nại." },
    price: { fields: ["amount", "product", "reference"], hint: "Ghi giá nhìn thấy trên nguồn." },
    other: {
      fields: ["quantity", "date", "party", "product", "reference"],
      hint: "Chỉ ghi điều đã quan sát.",
    },
  } satisfies Record<SupplierObservationKind, ObservationFormContract>,
  demand_observation: {
    requested_order: {
      fields: ["quantity", "party", "product", "reference"],
      hint: "Ghi nhu cầu khách nói ra; chưa tạo đơn bán.",
    },
    expected_delivery: {
      fields: ["date", "party", "product", "reference"],
      hint: "Ghi ngày giao được mong muốn.",
    },
    minimum_quantity: {
      fields: ["quantity", "party", "product", "reference"],
      hint: "Ghi số lượng tối thiểu được nói tới.",
    },
    availability_note: {
      fields: ["party", "product", "reference"],
      hint: "Ghi thông tin sẵn có từ khách.",
    },
    other: {
      fields: ["quantity", "date", "party", "product", "reference"],
      hint: "Chỉ ghi điều đã quan sát.",
    },
  } satisfies Record<DemandObservationKind, ObservationFormContract>,
} as const;

export function costObservationForm(kind: CostObservationKind): ObservationFormContract {
  return OBSERVATION_FORM_REGISTRY.cost_observation[kind];
}

export function reconciliationObservationForm(
  kind: ReconciliationObservationKind,
): ObservationFormContract {
  return OBSERVATION_FORM_REGISTRY.reconciliation_observation[kind];
}

/** Exact visibility check shared by the field-observation screens. */
export function observationFactVisible(
  family: ObservationFactFamily,
  kind: string,
  fact: string,
): boolean {
  return isObservationFactAllowed(family, kind, fact);
}
