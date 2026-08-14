import { z } from "zod";

export const OPERATIONS_EXCEPTION_KINDS = [
  "unallocated_payment",
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

export const operationsExceptionDefinitionSchema = z.object({
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
  unallocated_payment: {
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
  fulfilment_remainder_unresolved: {
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
    severity: "high",
    closeImpact: "acknowledgeable",
    explanation: "Hàng đã trả nhưng hệ quả công nợ hoặc thay thế chưa được quyết định.",
    unknown: "Hàng trả sẽ tạo hoàn tiền, tín dụng, thay thế hay chỉ là hàng nhận lại.",
    resolutionOptions: [{ code: "goods_only", label: "Xác nhận chỉ nhận lại hàng" }],
    nextAction: "Mở phiếu trả để ghi nhận quyết định xử lý.",
    resolutionCondition: "Một fact goods_only append-only xác nhận không phát sinh money effect.",
  },
  reconciliation_variance: {
    severity: "critical",
    closeImpact: "blocking",
    explanation: "Fact quan sát và sổ chuẩn đang khác nhau, nguyên nhân chưa được xác định.",
    unknown: "Nguồn nào là sai và cần correction nào để giải thích phần chênh lệch.",
    resolutionOptions: [
      { code: "record_correction", label: "Ghi nhận correction có nguồn" },
      { code: "record_matching_observation", label: "Ghi nhận đối soát" },
    ],
    nextAction: "Mở đối soát để ghi nhận nguồn và correction.",
    resolutionCondition:
      "Chênh lệch được giải thích bằng fact/correction append-only và kiểm tra trả về nhất quán.",
  },
} as const satisfies Record<OperationsExceptionKind, OperationsExceptionDefinition>;

export const operationsExceptionSchema = z.object({
  kind: operationsExceptionKindSchema,
  severity: operationsExceptionSeveritySchema,
  closeImpact: operationsExceptionCloseImpactSchema,
  source: operationsExceptionSourceSchema,
  sourceFacts: z.array(operationsExceptionFactSchema).min(1),
  explanation: z.string().min(1),
  unknown: z.string().min(1),
  resolutionOptions: z.array(operationsExceptionResolutionOptionSchema).min(1),
  nextAction: z.object({
    label: z.string().min(1),
    href: z.string().min(1).nullable(),
  }),
  resolutionCondition: z.string().min(1),
});
export type OperationsException = z.infer<typeof operationsExceptionSchema>;

export function operationsExceptionDefinition(
  kind: OperationsExceptionKind,
): OperationsExceptionDefinition {
  return OPERATIONS_EXCEPTION_DEFINITIONS[kind];
}
