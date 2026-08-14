import { z } from "zod";

/**
 * One semantic model is shared by the Board, close readiness and UI. WORK is a
 * known unfinished business workflow; UNCERTAINTY is an unresolved consequence;
 * INTEGRITY is a source/projection comparison that cannot be explained; CONTROL
 * is a system or operational gate. These categories are not inferred by clients.
 */
export const OPERATIONS_SEMANTIC_CATEGORIES = [
  "work",
  "uncertainty",
  "integrity",
  "control",
] as const;
export const operationsSemanticCategorySchema = z.enum(OPERATIONS_SEMANTIC_CATEGORIES);
export type OperationsSemanticCategory = z.infer<typeof operationsSemanticCategorySchema>;

export const OPERATIONS_EXCEPTION_KINDS = [
  "outstanding_delivery",
  "incomplete_receiving",
  "unallocated_payment",
  "overdue_receivable",
  "fulfilment_remainder_unresolved",
  "return_settlement_unresolved",
  "reconciliation_variance",
] as const;
export const operationsExceptionKindSchema = z.enum(OPERATIONS_EXCEPTION_KINDS);
export type OperationsExceptionKind = z.infer<typeof operationsExceptionKindSchema>;

export const OPERATIONS_EXCEPTION_SEVERITIES = ["critical", "high", "normal"] as const;
export const operationsExceptionSeveritySchema = z.enum(OPERATIONS_EXCEPTION_SEVERITIES);
export type OperationsExceptionSeverity = z.infer<typeof operationsExceptionSeveritySchema>;

export const OPERATIONS_EXCEPTION_CLOSE_IMPACTS = [
  "blocking",
  "acknowledgeable",
  "informational",
] as const;
export const operationsExceptionCloseImpactSchema = z.enum(OPERATIONS_EXCEPTION_CLOSE_IMPACTS);
export type OperationsExceptionCloseImpact = z.infer<typeof operationsExceptionCloseImpactSchema>;

export const operationsExceptionSourceSchema = z.object({
  kind: z.enum(["sale", "purchase", "payment", "delivery", "workspace"]),
  reference: z.string().min(1),
  /** Internal source identity. Clients must use the action href/reference for display. */
  id: z.string().min(1).nullable(),
});
export type OperationsExceptionSource = z.infer<typeof operationsExceptionSourceSchema>;

export const operationsExceptionFactSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});
export type OperationsExceptionFact = z.infer<typeof operationsExceptionFactSchema>;

export const operationsExceptionResolutionOptionSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});
export type OperationsExceptionResolutionOption = z.infer<
  typeof operationsExceptionResolutionOptionSchema
>;

export const operationsExceptionNextActionSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1).nullable(),
});
export type OperationsExceptionNextAction = z.infer<typeof operationsExceptionNextActionSchema>;

export const operationsExceptionDefinitionSchema = z.object({
  category: z.enum(["work", "uncertainty", "integrity"]),
  severity: operationsExceptionSeveritySchema,
  closeImpact: operationsExceptionCloseImpactSchema,
  explanation: z.string().min(1),
  unknown: z.string().min(1),
  resolutionOptions: z.array(operationsExceptionResolutionOptionSchema).min(1),
  nextAction: z.string().min(1),
  resolutionCondition: z.string().min(1),
});
export type OperationsExceptionDefinition = z.infer<typeof operationsExceptionDefinitionSchema>;

/**
 * The only authoritative operator copy and close classification for Board
 * exceptions. Read models contribute facts; they do not redefine this map.
 */
export const OPERATIONS_EXCEPTION_DEFINITIONS = {
  outstanding_delivery: {
    category: "work",
    severity: "normal",
    closeImpact: "informational",
    explanation: "Sale vẫn còn số lượng chưa được giao.",
    unknown: "Phần còn lại sẽ được giao qua Delivery nào và khi nào hoàn tất.",
    resolutionOptions: [
      { code: "dispatch_remaining", label: "Tạo phiếu giao phần còn lại" },
      { code: "complete_active_delivery", label: "Hoàn tất Delivery đang giao" },
    ],
    nextAction: "Mở Sale hoặc Delivery để tiếp tục giao phần còn lại.",
    resolutionCondition: "Số lượng còn phải giao bằng không hoặc Sale được loại bỏ hợp lệ.",
  },
  incomplete_receiving: {
    category: "work",
    severity: "normal",
    closeImpact: "acknowledgeable",
    explanation: "Purchase vẫn còn số lượng chưa được nhận đủ.",
    unknown: "Phần hàng còn thiếu sẽ được nhận qua Receipt nào và khi nào hoàn tất.",
    resolutionOptions: [
      { code: "record_receipt", label: "Ghi nhận Receipt còn thiếu" },
      { code: "complete_inspection", label: "Hoàn tất kiểm tra hàng nhận" },
    ],
    nextAction: "Mở Purchase để tiếp tục nhận và kiểm tra hàng.",
    resolutionCondition: "Số lượng được nhận hợp lệ đạt đủ số lượng Purchase.",
  },
  unallocated_payment: {
    category: "uncertainty",
    severity: "critical",
    closeImpact: "blocking",
    explanation: "Đã nhận tiền nhưng chưa biết khoản tiền thuộc Sale hay tín dụng nào.",
    unknown: "Khoản tiền này sẽ được phân bổ vào Sale nào hoặc giữ thành tín dụng.",
    resolutionOptions: [
      { code: "allocate_to_sale", label: "Phân bổ vào Sale" },
      { code: "retain_customer_credit", label: "Ghi nhận tín dụng khách hàng" },
    ],
    nextAction: "Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.",
    resolutionCondition: "Số tiền chưa phân bổ bằng không hoặc được ghi nhận thành credit hợp lệ.",
  },
  overdue_receivable: {
    category: "work",
    severity: "high",
    closeImpact: "acknowledgeable",
    explanation: "Khoản phải thu đã quá hạn nhưng chưa được thu đủ.",
    unknown: "Khoản phải thu sẽ được thu vào thời điểm nào và còn cần xử lý thương mại nào không.",
    resolutionOptions: [{ code: "record_payment", label: "Ghi nhận thanh toán" }],
    nextAction: "Mở Sale để thu hồi khoản phải thu quá hạn.",
    resolutionCondition: "Số dư phải thu quá hạn bằng không hoặc được xử lý bằng fact được phép.",
  },
  fulfilment_remainder_unresolved: {
    category: "uncertainty",
    severity: "high",
    closeImpact: "acknowledgeable",
    explanation: "Sale đã fulfil một phần nhưng cách xử lý phần còn lại chưa được quyết định.",
    unknown: "Phần còn lại sẽ được giao, điều chỉnh, huỷ hay chuyển sang Sale mới.",
    resolutionOptions: [
      { code: "continue_fulfilment", label: "Tiếp tục fulfilment" },
      { code: "commercial_correction", label: "Điều chỉnh thương mại" },
      { code: "cancel_remainder", label: "Huỷ phần còn lại" },
    ],
    nextAction: "Mở Sale để quyết định phần còn lại.",
    resolutionCondition:
      "Một quyết định fulfilment hoặc thương mại được ghi nhận bằng fact append-only.",
  },
  return_settlement_unresolved: {
    category: "uncertainty",
    severity: "high",
    closeImpact: "acknowledgeable",
    explanation: "Hàng đã trả nhưng hệ quả công nợ hoặc thay thế chưa được quyết định.",
    unknown: "Hàng trả sẽ tạo hoàn tiền, tín dụng, thay thế hay chỉ là hàng nhận lại.",
    resolutionOptions: [{ code: "goods_only", label: "Xác nhận chỉ nhận lại hàng" }],
    nextAction: "Mở phiếu trả để ghi nhận quyết định xử lý.",
    resolutionCondition: "Một fact goods_only append-only xác nhận không phát sinh money effect.",
  },
  reconciliation_variance: {
    category: "integrity",
    severity: "critical",
    closeImpact: "blocking",
    explanation: "Fact quan sát và sổ chuẩn đang khác nhau, nguyên nhân chưa được xác định.",
    unknown: "Nguồn nào là sai và cần correction nào để giải thích phần chênh lệch.",
    resolutionOptions: [{ code: "policy_blocked", label: "Chờ chính sách correction" }],
    nextAction: "Chờ chính sách reconciliation được phê duyệt.",
    resolutionCondition:
      "V1 chưa có command correction hoặc matching làm thay đổi comparison này; giữ exception cho đến khi policy và command được phê duyệt.",
  },
} as const satisfies Record<OperationsExceptionKind, OperationsExceptionDefinition>;

export const operationsExceptionSchema = z.object({
  kind: operationsExceptionKindSchema,
  category: z.enum(["work", "uncertainty", "integrity"]),
  severity: operationsExceptionSeveritySchema,
  closeImpact: operationsExceptionCloseImpactSchema,
  source: operationsExceptionSourceSchema,
  sourceFacts: z.array(operationsExceptionFactSchema).min(1),
  explanation: z.string().min(1),
  unknown: z.string().min(1),
  resolutionOptions: z.array(operationsExceptionResolutionOptionSchema).min(1),
  nextAction: operationsExceptionNextActionSchema,
  resolutionCondition: z.string().min(1),
});
export type OperationsException = z.infer<typeof operationsExceptionSchema>;

export function operationsExceptionDefinition(
  kind: OperationsExceptionKind,
): OperationsExceptionDefinition {
  return OPERATIONS_EXCEPTION_DEFINITIONS[kind];
}

export const OPERATIONS_CONTROL_EXCEPTION_KINDS = [
  "stale_realtime",
  "operational_close_blocked",
] as const;
export const operationsControlExceptionKindSchema = z.enum(OPERATIONS_CONTROL_EXCEPTION_KINDS);
export type OperationsControlExceptionKind = z.infer<typeof operationsControlExceptionKindSchema>;

export const operationsControlExceptionDefinitionSchema = z.object({
  category: z.literal("control"),
  severity: operationsExceptionSeveritySchema,
  explanation: z.string().min(1),
  unknown: z.string().min(1),
  resolutionOptions: z.array(operationsExceptionResolutionOptionSchema).min(1),
  nextAction: z.string().min(1),
  resolutionCondition: z.string().min(1),
});
export type OperationsControlExceptionDefinition = z.infer<
  typeof operationsControlExceptionDefinitionSchema
>;

export const OPERATIONS_CONTROL_EXCEPTION_DEFINITIONS = {
  stale_realtime: {
    category: "control",
    severity: "high",
    explanation: "Kênh cập nhật realtime đã cũ hoặc không truy cập được.",
    unknown: "Có thay đổi nào đã commit nhưng chưa được đọc lại từ durable change feed.",
    resolutionOptions: [
      { code: "reconnect_and_reconcile", label: "Kết nối lại và tải lại dữ liệu" },
    ],
    nextAction: "Kết nối lại realtime và tải lại dữ liệu nếu trạng thái chưa trở về live.",
    resolutionCondition: "Kênh realtime ở trạng thái live và durable change feed đã được drain.",
  },
  operational_close_blocked: {
    category: "control",
    severity: "critical",
    explanation: "Ngày vận hành chưa đủ điều kiện để chốt.",
    unknown: "Blocker nào còn thiếu và cần nguồn chứng minh hoặc xử lý nào để chốt ngày.",
    resolutionOptions: [{ code: "resolve_close_blockers", label: "Xử lý điều kiện chốt ngày" }],
    nextAction: "Mở Điều kiện chốt ngày để xử lý từng blocker.",
    resolutionCondition: "Readiness của ngày vận hành chuyển sang ready.",
  },
} as const satisfies Record<OperationsControlExceptionKind, OperationsControlExceptionDefinition>;

export const operationsControlExceptionSchema = z.object({
  kind: operationsControlExceptionKindSchema,
  category: z.literal("control"),
  severity: operationsExceptionSeveritySchema,
  source: operationsExceptionSourceSchema,
  sourceFacts: z.array(operationsExceptionFactSchema).min(1),
  explanation: z.string().min(1),
  unknown: z.string().min(1),
  resolutionOptions: z.array(operationsExceptionResolutionOptionSchema).min(1),
  nextAction: operationsExceptionNextActionSchema,
  resolutionCondition: z.string().min(1),
});
export type OperationsControlException = z.infer<typeof operationsControlExceptionSchema>;

export function operationsControlException(
  kind: OperationsControlExceptionKind,
  source: OperationsExceptionSource,
  sourceFacts: readonly OperationsExceptionFact[],
  href: string | null = null,
): OperationsControlException {
  const definition = OPERATIONS_CONTROL_EXCEPTION_DEFINITIONS[kind];
  return {
    kind,
    ...definition,
    source,
    sourceFacts: [...sourceFacts],
    nextAction: { label: definition.nextAction, href },
  };
}
