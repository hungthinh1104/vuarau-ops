import type {
  DeliveryStatus,
  DomainRejectionCode,
  PaymentStatus,
  PurchaseStatus,
  CustomerOrderStatus,
  SaleDueState,
  SaleStatus,
} from "@vuarau/domain-contracts";

export const CUSTOMER_ORDER_STATUS_COPY: Readonly<Record<CustomerOrderStatus, string>> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
};

/**
 * The only UI vocabulary registry. Domain values stay stable in the API; this
 * registry is the worker-facing translation layer and must be used whenever a
 * value can reach rendered copy.
 */
export const UI_COPY_REGISTRY = {
  status: {
    delivery: {
      draft: "Chờ xuất kho",
      dispatched: "Đang giao",
      delivered: "Đã giao",
      cancelled: "Đã loại bỏ",
    },
    purchase: {
      draft: "Nháp",
      confirmed: "Đã xác nhận",
      discarded: "Đã loại bỏ",
    },
    sale: {
      draft: "Nháp",
      posted: "Đã chốt",
      discarded: "Đã loại bỏ",
    },
  },
  qualityOutcome: {
    accepted: "Đạt",
    quarantined: "Tạm giữ",
    rejected: "Trả nhà cung cấp",
    disposed: "Loại bỏ",
  },
  severity: {
    minor: "Nhẹ",
    moderate: "Vừa",
    severe: "Nặng",
  },
  reasonCode: {
    wrong_amount: "Sai số tiền",
    wrong_customer: "Sai khách hàng",
    goods_returned: "Khách trả hàng",
    wrong_quantity: "Sai số lượng",
    other: "Lý do khác",
    count_correction: "Điều chỉnh kiểm đếm",
    spoilage: "Hư hỏng",
    opening_balance: "Số dư ban đầu",
    write_off: "Ghi giảm công nợ",
    wrong_supplier: "Sai nhà cung cấp",
    wrong_product: "Sai mặt hàng",
    wrong_price: "Sai giá",
    duplicate: "Trùng chứng từ",
    commercial_correction: "Sửa phần tiền sau khi nhập hàng",
    shrinkage: "Hao hụt",
  },
  blockedReason: {
    missing_product: "Thiếu mặt hàng liên kết",
    invalid_product: "Mặt hàng chưa hợp lệ",
    integrity_failure: "Dữ liệu cần được kiểm tra",
  },
  permission: {
    "delivery.create": "Tạo phiếu giao",
    "delivery.dispatch": "Xuất kho và bắt đầu giao",
    "delivery.complete": "Xác nhận giao xong",
    "intake.record": "Ghi nhận hàng nhập",
    "quality.inspect": "Kiểm hàng",
    "quality.disposition": "Xử lý hàng lỗi",
  },
  report: {
    metric: {
      revenue: {
        label: "Doanh thu",
        description: "Chưa đủ dữ liệu để ghi nhận doanh thu an toàn.",
        condition: "Cần chốt thời điểm ghi nhận và đối chiếu với chứng từ.",
        nextStep: "Bổ sung các trường hợp thực tế đã được xác nhận.",
        formula: "Tổng tiền của các đơn bán đã chốt trong kỳ.",
        sources: "Đơn bán đã chốt",
        drilldown: "Mở các đơn bán nguồn",
        action: "Kiểm tra chứng từ gốc trước khi sử dụng số liệu.",
      },
      cogs: {
        label: "Giá vốn hàng bán",
        description: "Chưa đủ dữ liệu để tính giá vốn an toàn.",
        condition: "Cần chốt cách định giá và cách phân bổ chi phí.",
        nextStep: "Bổ sung các trường hợp định giá và sửa số liệu đã được xác nhận.",
        formula: "Giá trị vốn của hàng đã xuất bán trong kỳ.",
        sources: "Phiếu nhập kho và phiếu xuất kho",
        drilldown: "Mở các phiếu hàng nguồn",
        action: "Kiểm tra số liệu gốc; không tự sửa số tồn.",
      },
      gross_profit: {
        label: "Lợi nhuận gộp",
        description: "Chưa đủ dữ liệu để tính lợi nhuận gộp.",
        condition: "Cần có cả doanh thu và giá vốn đã được đối chiếu.",
        nextStep: "Hoàn tất dữ liệu doanh thu và giá vốn cho cùng kỳ.",
        formula: "Doanh thu trừ giá vốn hàng bán.",
        sources: "Đơn bán và phiếu hàng đã đối chiếu",
        drilldown: "Mở các chứng từ nguồn",
        action: "Kiểm tra chứng từ gốc trước khi dùng kết quả.",
      },
      gross_margin: {
        label: "Biên lợi nhuận gộp",
        description: "Chưa đủ dữ liệu để tính biên lợi nhuận.",
        condition: "Cần có doanh thu và giá vốn hợp lệ, khác 0.",
        nextStep: "Bổ sung dữ liệu kỳ so sánh đã được xác nhận.",
        formula: "Lợi nhuận gộp chia cho doanh thu.",
        sources: "Đơn bán và phiếu hàng đã đối chiếu",
        drilldown: "Mở các chứng từ nguồn",
        action: "Kiểm tra kỳ và chứng từ gốc trước khi so sánh.",
      },
      waste_value: {
        label: "Giá trị hao hụt",
        description: "Chưa đủ dữ liệu để tính giá trị hao hụt.",
        condition: "Cần thống nhất cách ghi nhận hàng hư, hàng lỗi và hàng trả.",
        nextStep: "Bổ sung các trường hợp hao hụt có chứng từ liên quan.",
        formula: "Giá trị của phần hàng được ghi nhận là hao hụt trong kỳ.",
        sources: "Phiếu kiểm hàng và phiếu xử lý hàng lỗi",
        drilldown: "Mở các phiếu xử lý nguồn",
        action: "Kiểm tra ảnh hoặc phiếu liên quan.",
      },
      waste_rate: {
        label: "Tỷ lệ hao hụt",
        description: "Chưa đủ dữ liệu để tính tỷ lệ hao hụt.",
        condition: "Cần xác định đủ phần hàng hao hụt và tổng lượng làm mẫu số.",
        nextStep: "Bổ sung các kỳ có số liệu hao hụt đã được xác nhận.",
        formula: "Lượng hao hụt chia cho tổng lượng làm mẫu số.",
        sources: "Phiếu nhập kho và phiếu xử lý hàng lỗi",
        drilldown: "Mở các phiếu xử lý nguồn",
        action: "Kiểm tra số lượng gốc trước khi so sánh.",
      },
      price_margin_change: {
        label: "Biến động giá và biên",
        description: "Chưa đủ dữ liệu để so sánh giá và biên.",
        condition: "Cần có giá vốn làm mốc so sánh cho các kỳ.",
        nextStep: "Bổ sung giá vốn và kỳ so sánh đã được xác nhận.",
        formula: "So sánh giá bán và biên giữa các kỳ.",
        sources: "Đơn bán và phiếu hàng đã đối chiếu",
        drilldown: "Mở các chứng từ nguồn",
        action: "Kiểm tra giá và số lượng trên chứng từ gốc.",
      },
      receivable_aging: {
        label: "Tuổi nợ phải thu",
        description: "Chưa đủ dữ liệu để chia nhóm tuổi nợ phải thu.",
        condition: "Cần có điều khoản thanh toán và ngày đến hạn rõ ràng.",
        nextStep: "Bổ sung các trường hợp thanh toán và phân bổ đã được xác nhận.",
        formula: "Phân nhóm khoản phải thu theo số ngày còn lại hoặc đã quá hạn.",
        sources: "Sổ công nợ khách hàng và phiếu thu",
        drilldown: "Mở chi tiết công nợ",
        action: "Kiểm tra ngày đến hạn và các khoản đã thu.",
      },
      payable_aging: {
        label: "Tuổi nợ phải trả",
        description: "Chưa đủ dữ liệu để chia nhóm tuổi nợ phải trả.",
        condition: "Cần có thời điểm ghi nhận và điều khoản thanh toán nhà cung cấp.",
        nextStep: "Bổ sung các trường hợp thanh toán và phân bổ đã được xác nhận.",
        formula: "Phân nhóm khoản phải trả theo số ngày còn lại hoặc đã quá hạn.",
        sources: "Sổ phải trả nhà cung cấp và phiếu chi",
        drilldown: "Mở chi tiết phải trả",
        action: "Kiểm tra ngày đến hạn và các khoản đã chi.",
      },
      inventory_health: {
        label: "Sức khoẻ tồn kho",
        description: "Chưa đủ dữ liệu để đánh giá tồn kho.",
        condition: "Cần thống nhất ngưỡng tồn và cách xử lý chênh lệch.",
        nextStep: "Bổ sung ngưỡng tồn và các trường hợp kiểm kê đã xác nhận.",
        formula: "Đánh giá số lượng tồn theo ngưỡng đã được chốt.",
        sources: "Số dư tồn kho và phiếu kiểm kê",
        drilldown: "Mở chi tiết tồn kho",
        action: "Kiểm tra số dư và phiếu kiểm kê liên quan.",
      },
      reorder_risk: {
        label: "Rủi ro cần nhập thêm",
        description: "Chưa đủ dữ liệu để cảnh báo cần nhập thêm.",
        condition: "Cần có mức tối thiểu, mức mục tiêu và thời gian cung ứng.",
        nextStep: "Bổ sung ngưỡng nhập thêm theo mặt hàng và đơn vị.",
        formula: "So sánh tồn hiện tại với ngưỡng nhập thêm đã chốt.",
        sources: "Số dư tồn kho và cấu hình nhập thêm",
        drilldown: "Mở chi tiết mặt hàng",
        action: "Kiểm tra tồn thực tế trước khi tạo đơn mua.",
      },
      cash_gap: {
        label: "Khoảng thiếu tiền dự kiến",
        description: "Chưa đủ dữ liệu để ước tính khoảng thiếu tiền.",
        condition: "Cần có số liệu chốt ca, nộp tiền và thanh toán đối chiếu.",
        nextStep: "Bổ sung các lần chốt và đối chiếu sao kê đã xác nhận.",
        formula: "So sánh tiền dự kiến với các khoản phải thu, phải trả trong kỳ.",
        sources: "Sổ tiền, công nợ và sao kê",
        drilldown: "Mở chi tiết tiền và công nợ",
        action: "Kiểm tra các khoản chưa được đối chiếu.",
      },
      shift_close_variance: {
        label: "Chênh lệch chốt ca",
        description: "Chưa đủ dữ liệu để tính chênh lệch chốt ca.",
        condition: "Cần có lần chốt ca đã ghi nhận cùng số tiền kiểm đếm.",
        nextStep: "Ghi nhận và đối chiếu một lần chốt ca đầy đủ.",
        formula: "Tiền thực đếm trừ số tiền theo sổ tại thời điểm chốt.",
        sources: "Lần chốt ca và sổ tiền",
        drilldown: "Mở chi tiết chốt ca",
        action: "Kiểm tra số tiền đếm và các giao dịch trong ca.",
      },
      bank_reconciliation: {
        label: "Đối chiếu ngân hàng",
        description: "Chưa đủ dữ liệu để đối chiếu ngân hàng.",
        condition: "Cần có sao kê và quy tắc ghép giao dịch đã được xác nhận.",
        nextStep: "Bổ sung sao kê và xử lý các dòng chưa ghép.",
        formula: "Ghép giao dịch trong sổ với dòng sao kê tương ứng.",
        sources: "Sổ tiền và sao kê ngân hàng",
        drilldown: "Mở các dòng chưa ghép",
        action: "Kiểm tra từng dòng trước khi xác nhận đối chiếu.",
      },
      supplier_performance: {
        label: "Hiệu quả nhà cung cấp",
        description: "Tóm tắt lượng đã hẹn, đã nhận và đạt theo từng nhà cung cấp.",
        condition: "Chỉ dùng các ghi nhận đã được duyệt và còn hiệu lực.",
        nextStep: "Mở các ghi nhận nguồn khi cần kiểm tra.",
        formula: "So sánh lượng đã hẹn, đã nhận, đạt và thời điểm giao hàng.",
        sources: "Ghi nhận nhà cung cấp",
        drilldown: "Mở các ghi nhận nguồn",
        action: "Kiểm tra dữ liệu gốc; không tự xếp hạng hoặc tạo đơn mua.",
      },
    },
    diagnostic: {
      projection_unavailable: "Bản tổng hợp chưa đối chiếu được với dữ liệu gốc.",
      workspace_integrity_attention: "Dữ liệu trong vựa cần được kiểm tra.",
    },
  },
} as const;

export type ReportMetricCopy =
  (typeof UI_COPY_REGISTRY.report.metric)[keyof typeof UI_COPY_REGISTRY.report.metric];

export function copyForReportMetric(metricId: string): ReportMetricCopy {
  return (
    UI_COPY_REGISTRY.report.metric[metricId as keyof typeof UI_COPY_REGISTRY.report.metric] ??
    UI_COPY_REGISTRY.report.metric.revenue
  );
}

export function copyForReportDiagnostic(diagnostic: string): string {
  return (
    UI_COPY_REGISTRY.report.diagnostic[
      diagnostic as keyof typeof UI_COPY_REGISTRY.report.diagnostic
    ] ?? "Số liệu cần được kiểm tra trước khi sử dụng."
  );
}

export type QualityOutcomeCopyKey = keyof typeof UI_COPY_REGISTRY.qualityOutcome;

export function copyForBlockedReason(reason: string | null | undefined): string {
  if (reason === null || reason === undefined || reason.trim() === "") {
    return "Chưa thể thực hiện lúc này. Hãy kiểm tra lại thông tin.";
  }
  return (
    UI_COPY_REGISTRY.blockedReason[reason as keyof typeof UI_COPY_REGISTRY.blockedReason] ??
    "Chưa thể thực hiện lúc này. Hãy kiểm tra lại thông tin."
  );
}

export function copyForReasonCode(reason: string | null | undefined): string {
  if (reason === null || reason === undefined || reason.trim() === "") return "Lý do khác";
  return (
    UI_COPY_REGISTRY.reasonCode[reason as keyof typeof UI_COPY_REGISTRY.reasonCode] ?? "Lý do khác"
  );
}

/**
 * Vietnamese copy, keyed by the stable rejection code.
 *
 * The rule this file exists to enforce: **never render `error.message` as the
 * primary text.** Messages from the server are English today, will become
 * Vietnamese later, and will be reworded — `code` is the contract
 * (docs/06-api-contracts/error-contract.md). Branching on the code and keeping the
 * message for a diagnostic panel is the only arrangement that survives both.
 *
 * Each entry says what happened and what to do next. "Dữ liệu không hợp lệ" tells
 * a worker at 3 a.m. nothing they can act on.
 */
const REJECTION_COPY: Readonly<Partial<Record<DomainRejectionCode, string>>> = {
  AUTHENTICATION_REQUIRED: "Cần đăng nhập để tiếp tục.",
  AUTHENTICATION_INVALID: "Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.",
  ACTOR_NOT_FOUND: "Tài khoản này chưa được thêm vào hệ thống. Hãy báo chủ vựa.",
  ACTOR_IMPERSONATION_DENIED: "Không thể ghi thay người khác.",

  WORKSPACE_ACCESS_DENIED: "Bạn không có quyền truy cập vựa này.",
  WORKSPACE_MEMBERSHIP_INACTIVE: "Quyền truy cập của bạn đã bị thu hồi. Hãy liên hệ chủ vựa.",
  PERMISSION_DENIED: "Bạn không có quyền thực hiện việc này. Hãy nhờ chủ vựa hoặc kế toán.",
  WORKSPACE_LAST_OWNER: "Không thể thu hồi chủ vựa cuối cùng. Hãy thêm một chủ vựa khác trước đã.",
  WORKSPACE_MEMBER_NOT_FOUND: "Không tìm thấy thành viên này trong vựa.",
  WORKSPACE_MEMBER_ALREADY_EXISTS: "Tài khoản này đã có hồ sơ thành viên trong vựa.",
  WORKSPACE_MEMBER_ALREADY_ACTIVE: "Thành viên này đang hoạt động.",
  WORKSPACE_MEMBER_ROLE_UNCHANGED: "Thành viên đã có vai trò này.",
  WORKSPACE_MEMBER_ROLE_CONFLICT: "Vai trò vừa được người khác thay đổi. Hãy tải lại.",
  WORKSPACE_MEMBER_SELF_ROLE_CHANGE_DENIED: "Bạn không thể tự thay đổi vai trò của mình.",
  WORKSPACE_PROFILE_VERSION_CONFLICT:
    "Cấu hình vận hành vừa được người khác thay đổi. Hãy tải lại.",
  WORKSPACE_PROFILE_UNCHANGED: "Cấu hình vận hành không có thay đổi.",
  WORKSPACE_WORKFLOW_DISABLED: "Quy trình này đang tắt trong cấu hình của vựa.",
  WORKSPACE_POLICY_ALREADY_EXISTS: "Phiên bản quy định này đã tồn tại trong vựa.",
  WORKSPACE_POLICY_NOT_FOUND: "Không tìm thấy phiên bản quy định này.",
  WORKSPACE_POLICY_NOT_DRAFT: "Chỉ quy định ở trạng thái nháp mới có thể được duyệt.",
  WORKSPACE_POLICY_NOT_APPROVED: "Quy định này đã được ngừng hiệu lực.",
  WORKSPACE_POLICY_EVIDENCE_REQUIRED: "Cần ít nhất một tham chiếu để duyệt quy định.",
  WORKSPACE_POLICY_VERSION_CONFLICT: "Quy định vừa được người khác thay đổi. Hãy tải lại.",
  WORKSPACE_POLICY_EFFECTIVE_RANGE_INVALID: "Khoảng hiệu lực của quy định không hợp lệ.",

  CUSTOMER_NOT_FOUND: "Không tìm thấy khách hàng này.",
  CUSTOMER_NAME_REQUIRED: "Tên khách hàng không được để trống.",
  CUSTOMER_VERSION_CONFLICT: "Người khác vừa sửa khách hàng này. Hãy tải lại để xem thay đổi.",
  CUSTOMER_ALREADY_INACTIVE: "Khách hàng này đã ngưng hoạt động.",
  CUSTOMER_ALREADY_ACTIVE: "Khách hàng này đang hoạt động.",
  PRODUCT_NOT_FOUND: "Không tìm thấy mặt hàng trong vựa này.",
  PRODUCT_VERSION_CONFLICT: "Mặt hàng đã được người khác cập nhật.",
  QUALITY_GRADE_NOT_FOUND: "Không tìm thấy phân hạng chất lượng trong vựa này.",
  QUALITY_GRADE_INACTIVE: "Phân hạng chất lượng này đang ngưng sử dụng.",
  QUALITY_GRADE_VERSION_CONFLICT: "Phân hạng chất lượng đã được người khác cập nhật.",
  QUALITY_GRADE_NOT_USED: "Vựa này không sử dụng phân hạng thương mại cho giao dịch mới.",
  PRICING_RULE_INVALID:
    "Quy tắc giá chưa hợp lệ. Kiểm tra phạm vi, thời hạn và các khoản điều chỉnh.",
  BACKUP_DIGEST_INVALID: "Checksum bản sao lưu không hợp lệ.",
  BACKUP_UNSAFE_TARGET: "Chỉ có thể phục hồi vào vựa trống.",
  BACKUP_INTEGRITY_ERROR: "Bản sao lưu có tham chiếu hoặc dữ liệu không hợp lệ.",
  SUPPLIER_NOT_FOUND: "Không tìm thấy nhà cung cấp trong vựa này.",
  SUPPLIER_INACTIVE: "Nhà cung cấp đang ngừng hoạt động.",
  SUPPLIER_VERSION_CONFLICT: "Nhà cung cấp hoặc phiếu chi đã được cập nhật.",
  SUPPLIER_PAYMENT_AMOUNT_INVALID: "Số tiền chi phải lớn hơn 0.",
  SUPPLIER_PAYMENT_NOT_FOUND: "Không tìm thấy phiếu chi nhà cung cấp.",
  SUPPLIER_PAYMENT_ALREADY_REVERSED: "Phiếu chi này đã hoàn tác hết.",
  SUPPLIER_PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT: "Số tiền hoàn tác vượt phần còn có thể hoàn.",
  SUPPLIER_PAYMENT_REVERSAL_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tác phiếu chi.",
  SUPPLIER_ACCOUNT_ADJUSTMENT_REASON_REQUIRED: "Điều chỉnh phải có lý do.",
  SUPPLIER_ACCOUNT_ADJUSTMENT_AMOUNT_INVALID: "Số tiền điều chỉnh phải lớn hơn 0.",
  SUPPLIER_ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE:
    "Sổ phải trả nhà cung cấp có dữ liệu không toàn vẹn.",
  SUPPLIER_ACCOUNT_RECONCILIATION_REBUILD_UNSAFE:
    "Không thể dựng lại số dư vì nguồn chuẩn đang không toàn vẹn.",
  PURCHASE_NOT_FOUND: "Không tìm thấy đơn mua hàng.",
  PURCHASE_EMPTY: "Đơn mua chưa có mặt hàng.",
  PURCHASE_LINE_INVALID: "Có dòng mua hàng không hợp lệ.",
  PURCHASE_VERSION_CONFLICT: "Đơn mua đã được người khác cập nhật.",
  PURCHASE_ALREADY_CONFIRMED: "Đơn mua đã xác nhận và không thể sửa.",
  PURCHASE_ALREADY_DISCARDED: "Đơn mua nháp đã bị bỏ.",
  PURCHASE_ALREADY_VOIDED: "Đơn mua đã được hoàn tác.",
  PURCHASE_NOT_CONFIRMED: "Chỉ đơn mua đã xác nhận mới có thể hoàn tác.",
  PURCHASE_REPLACEMENT_INVALID:
    "Đơn thay thế chỉ được tạo cho một đơn mua đã hoàn tác và chưa có đơn thay thế.",
  PURCHASE_HAS_ACTIVE_RECEIPTS:
    "Đơn mua đã có hàng thực nhận nên chưa thể hoàn tác thương mại. Chỉ hoàn tác phiếu nhận nếu chính phiếu nhận đã ghi sai; không đảo hàng thật chỉ để sửa đơn mua.",
  PURCHASE_CORRECTION_POLICY_UNAVAILABLE:
    "Chưa có quy định sửa phần tiền sau khi nhập hàng được vựa duyệt và đang áp dụng.",
  PURCHASE_VOID_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tác đơn mua.",
  RECEIPT_NOT_FOUND: "Không tìm thấy phiếu nhập kho.",
  RECEIPT_ALREADY_REVERSED: "Phiếu nhập kho đã được hoàn tác.",
  RECEIPT_QUANTITY_EXCEEDS_PURCHASE: "Số lượng nhận vượt số lượng đã mua.",
  RECEIPT_UNIT_MISMATCH: "Đơn vị nhận hàng không khớp dòng mua.",
  RECEIPT_REVERSAL_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tác nhận hàng.",
  INVENTORY_ADJUSTMENT_REASON_REQUIRED: "Điều chỉnh tồn kho phải có lý do.",
  INVENTORY_RECLASSIFICATION_INVALID: "Chuyển hạng cần hai hạng khác nhau và số lượng lớn hơn 0.",
  INVENTORY_RECLASSIFICATION_REASON_REQUIRED: "Chuyển hạng tồn kho phải có lý do.",
  INVENTORY_RECONCILIATION_INTEGRITY_FAILURE: "Sổ chuyển động tồn kho có dữ liệu không toàn vẹn.",

  SALE_NOT_FOUND: "Không tìm thấy đơn hàng này.",
  SALE_EMPTY: "Đơn chưa có mặt hàng nào. Hãy thêm ít nhất một dòng trước khi chốt.",
  SALE_LINE_INVALID: "Có dòng hàng chưa hợp lệ. Kiểm tra số lượng và đơn giá.",
  SALE_PRODUCT_REQUIRED: "Mỗi dòng phải chọn một mặt hàng trong danh mục trước khi chốt.",
  SALE_PRODUCT_NOT_FOUND: "Mặt hàng đã chọn không còn tồn tại trong vựa này. Hãy chọn lại.",
  SALE_PRODUCT_INACTIVE: "Mặt hàng đã chọn đang ngưng hoạt động. Hãy chọn mặt hàng khác.",
  SALE_PRODUCT_SNAPSHOT_MISMATCH:
    "Tên hoặc đơn vị dòng hàng không còn khớp mặt hàng đã chọn. Hãy chọn lại mặt hàng.",
  SALE_QUALITY_GRADE_REQUIRED: "Mỗi dòng phải chọn phân hạng chất lượng trước khi chốt.",
  SALE_QUALITY_GRADE_NOT_FOUND: "Phân hạng đã chọn không còn tồn tại trong vựa này.",
  SALE_QUALITY_GRADE_INACTIVE: "Phân hạng đã chọn đang ngưng sử dụng.",
  SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH:
    "Tên phân hạng trên dòng hàng đã thay đổi. Hãy chọn lại phân hạng.",
  SALE_ALREADY_POSTED:
    "Đơn đã chốt nên không sửa được nữa. Muốn sửa thì hoàn tác rồi tạo đơn thay thế.",
  SALE_VERSION_CONFLICT: "Người khác vừa sửa đơn này. Hãy tải lại để xem thay đổi.",
  SALE_CURRENCY_MISMATCH: "Đơn vị tiền tệ không khớp.",
  SALE_IMMUTABLE: "Đơn đã chốt là bản ghi cố định, không sửa trực tiếp được.",
  SALE_ALREADY_DISCARDED: "Đơn nháp này đã bị bỏ.",
  SALE_POSTING_ENTRY_MISSING:
    "Đơn đã chốt nhưng thiếu bút toán công nợ. Hãy báo người quản trị để kiểm tra dữ liệu.",

  SALE_NOT_POSTED: "Đơn chưa chốt thì không hoàn tác được — hãy bỏ đơn nháp.",
  SALE_ALREADY_VOIDED: "Đơn này đã được hoàn tác rồi.",
  SALE_VOID_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tác đơn.",
  SALE_GOODS_RETURN_INCOMPLETE:
    "Đơn vẫn còn hàng thực giao chưa trả hết. Không thể hoàn tác toàn bộ công nợ như một lần trả toàn bộ.",
  SALE_REPLACEMENT_NOT_VOIDED: "Chỉ tạo đơn thay thế sau khi đơn gốc đã được hoàn tác.",
  SALE_REPLACEMENT_ALREADY_EXISTS: "Đơn này đã có một đơn thay thế trong chuỗi điều chỉnh.",
  SALE_REPLACEMENT_ACTOR_MISMATCH:
    "Chỉ người đã hoàn tác đơn mới có thể tiếp tục tạo đơn thay thế.",
  SALE_REPLACEMENT_CUSTOMER_UNCHANGED:
    "Với lý do sai khách hàng, hãy chọn một khách hàng khác cho đơn thay thế.",
  SALE_REPLACEMENT_CURRENCY_MISMATCH: "Đơn thay thế phải dùng cùng loại tiền với đơn gốc.",
  CREDIT_POLICY_UNAVAILABLE:
    "Chính sách hạn mức chưa có đủ quy trình an toàn để chốt đơn. Hãy nhờ chủ vựa kiểm tra cấu hình.",
  CREDIT_LIMIT_EXCEEDED:
    "Đơn này vượt hạn mức công nợ đã cấu hình. Kiểm tra số dư hoặc nhờ chủ vựa duyệt lại hạn mức.",

  PAYMENT_AMOUNT_INVALID: "Số tiền thanh toán phải lớn hơn 0.",
  PAYMENT_NOT_FOUND: "Không tìm thấy phiếu thu này.",
  PAYMENT_ALREADY_REVERSED: "Phiếu thu này đã hoàn tác hết.",
  PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT: "Số tiền hoàn vượt quá phần còn hoàn được.",
  PAYMENT_REVERSAL_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tiền.",
  PAYMENT_VERSION_CONFLICT: "Người khác vừa sửa phiếu thu này. Hãy tải lại để xem thay đổi.",
  PAYMENT_CURRENCY_MISMATCH: "Đơn vị tiền tệ không khớp.",

  DEBT_ADJUSTMENT_REASON_REQUIRED: "Điều chỉnh công nợ phải có lý do.",
  DEBT_ADJUSTMENT_AMOUNT_INVALID: "Số tiền điều chỉnh phải lớn hơn 0.",
  ACCOUNT_ADJUSTMENT_NOT_FOUND: "Không tìm thấy điều chỉnh công nợ này.",
  ACCOUNT_ADJUSTMENT_INTEGRITY_ERROR:
    "Điều chỉnh công nợ thiếu dữ liệu sổ cái. Hãy báo người quản trị để kiểm tra.",
  ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE:
    "Sổ công nợ có dữ liệu hỏng nên chưa thể đối soát tự động.",
  ACCOUNT_RECONCILIATION_REBUILD_UNSAFE:
    "Không thể dựng lại số dư vì sai lệch không chỉ nằm ở bảng tổng hợp.",

  DUPLICATE_COMMAND: "Lệnh này đã được gửi với mã khác. Hãy tải lại rồi thử lại.",
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD:
    "Lệnh này đã được gửi với nội dung khác. Hãy tải lại rồi thử lại.",
  COMMAND_IN_PROGRESS: "Lệnh trước đang được xử lý. Chờ một chút rồi thử lại.",
  INVALID_COMMAND_PAYLOAD: "Có ô nhập chưa hợp lệ. Kiểm tra lại các ô được đánh dấu.",
  TRANSACTION_TIME_IN_FUTURE: "Thời điểm giao dịch nằm ở tương lai. Kiểm tra giờ trên máy.",

  DELIVERY_NOT_FOUND: "Không tìm thấy phiếu giao hàng này.",
  DELIVERY_LINE_INVALID: "Dòng giao hàng không khớp với đơn bán.",
  DELIVERY_VERSION_CONFLICT: "Phiếu giao hàng vừa được thay đổi. Hãy tải lại.",
  DELIVERY_ALREADY_DISPATCHED: "Phiếu giao hàng đã xuất kho.",
  DELIVERY_ALREADY_CANCELLED: "Phiếu giao hàng đã huỷ.",
  DELIVERY_ALREADY_DELIVERED: "Phiếu giao hàng đã hoàn tất.",
  DELIVERY_QUANTITY_EXCEEDS_SALE: "Số lượng giao vượt quá phần còn lại của đơn bán.",
  DELIVERY_RETURN_EXCEEDS_DISPATCH: "Số lượng trả vượt quá số đã giao.",
  DELIVERY_PRODUCT_REQUIRED: "Dòng bán cần liên kết sản phẩm trước khi giao.",
  DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED:
    "Đơn thay thế có đơn gốc đã thực giao. Không tạo giao hàng mới vì sẽ ghi hàng đi lần hai.",
  DELIVERY_REASON_REQUIRED: "Cần ghi rõ lý do.",
  DOCUMENT_NOT_FOUND: "Không tìm thấy chứng từ này.",
  DOCUMENT_SOURCE_INVALID: "Nguồn chứng từ không hợp lệ.",
  DOCUMENT_SHARE_NOT_FOUND: "Không tìm thấy liên kết chia sẻ.",
  DOCUMENT_SHARE_REVOKED: "Liên kết chia sẻ đã bị thu hồi.",
  DOCUMENT_SHARE_EXPIRED: "Liên kết chia sẻ đã hết hạn.",
  REPORT_INTEGRITY_FAILURE: "Báo cáo phát hiện dữ liệu cần kiểm tra.",

  CASH_ACCOUNT_NOT_FOUND: "Không tìm thấy tài khoản tiền trong vựa này.",
  CASH_ACCOUNT_INACTIVE: "Tài khoản tiền này đã ngừng sử dụng.",
  CASH_ACCOUNT_VERSION_CONFLICT: "Tài khoản tiền vừa được người khác cập nhật.",
  CASH_ACCOUNT_ALREADY_INACTIVE: "Tài khoản tiền đã ngừng sử dụng.",
  CASH_ACCOUNT_ALREADY_ACTIVE: "Tài khoản tiền đang hoạt động.",
  CASH_ACCOUNT_CUSTODIAN_INVALID: "Tài khoản tiền nhân viên giữ phải chỉ định đúng người giữ.",
  CASH_ACCOUNT_REQUIRED: "Hãy chọn tài khoản tiền nhận hoặc chi.",
  CASH_ACCOUNT_CURRENCY_MISMATCH: "Đơn vị tiền không khớp với tài khoản tiền.",
  CASH_ACCOUNT_LINK_MISMATCH: "Tài khoản tiền không khớp với giao dịch gốc.",
  CASH_AMOUNT_INVALID: "Số tiền phải là số nguyên dương hợp lệ.",
  EXPENSE_NOT_FOUND: "Không tìm thấy khoản chi.",
  EXPENSE_ALREADY_REVERSED: "Khoản chi đã được hoàn tác.",
  CASH_TRANSFER_INVALID: "Chuyển tiền phải dùng hai tài khoản khác nhau.",
  CASH_TRANSFER_NOT_FOUND: "Không tìm thấy giao dịch chuyển tiền.",
  CASH_TRANSFER_ALREADY_REVERSED: "Giao dịch chuyển tiền đã được hoàn tác.",
  CASH_RECONCILIATION_INTEGRITY_FAILURE: "Sổ tiền có nguồn dữ liệu không nhất quán.",
  CASH_RECONCILIATION_REBUILD_UNSAFE: "Không thể dựng lại số dư khi nguồn sổ tiền chưa an toàn.",
  QUALITY_ISSUE_CODE_NOT_FOUND: "Không tìm thấy mã lỗi chất lượng.",
  QUALITY_ISSUE_CODE_INACTIVE: "Mã lỗi chất lượng này đã ngừng sử dụng.",
  QUALITY_ISSUE_CODE_VERSION_CONFLICT: "Mã lỗi chất lượng vừa được người khác cập nhật.",
  QUALITY_ISSUE_CODE_ALREADY_ACTIVE: "Mã lỗi chất lượng đang hoạt động.",
  QUALITY_ISSUE_CODE_ALREADY_INACTIVE: "Mã lỗi chất lượng đã ngừng sử dụng.",
  GOODS_ARRIVAL_NOT_FOUND: "Không tìm thấy lần nhận hàng này.",
  GOODS_ARRIVAL_ALREADY_REVERSED: "Lần nhận hàng đã được hoàn tác.",
  GOODS_ARRIVAL_HAS_DOWNSTREAM_FACTS:
    "Lần nhận hàng đã có kiểm hàng hoặc quyết định xử lý nên không thể hoàn tác trực tiếp.",
  GOODS_ARRIVAL_LINE_INVALID: "Có dòng nhận hàng không hợp lệ.",
  GOODS_ARRIVAL_PURCHASE_MISMATCH: "Nhận hàng không khớp nhà cung cấp hoặc dòng mua đã chọn.",
  WEIGHING_REQUIRED: "Vựa này yêu cầu ghi cân tổng, bì và khối lượng tịnh.",
  WEIGHING_NOT_USED: "Vựa này không sử dụng quy trình cân tổng–bì–tịnh.",
  WEIGHING_INVALID: "Số cân không hợp lệ; khối lượng tịnh phải bằng tổng trừ bì.",
  QUALITY_INSPECTION_NOT_FOUND: "Không tìm thấy lần kiểm hàng chất lượng.",
  QUALITY_INSPECTION_ALREADY_REVERSED: "Lần kiểm hàng đã được hoàn tác.",
  QUALITY_INSPECTION_QUANTITY_EXCEEDS_ARRIVAL: "Số lượng kiểm hàng vượt số nhận hàng.",
  QUALITY_INSPECTION_INVALID: "Nội dung kiểm hàng chất lượng không hợp lệ.",
  QUALITY_INSPECTION_HAS_DOWNSTREAM_FACTS:
    "Lần kiểm hàng đã được dùng để xử lý hàng nên không thể hoàn tác trực tiếp.",
  QUALITY_DISPOSITION_SOURCE_NOT_FOUND: "Không tìm thấy nguồn hàng cần xử lý chất lượng.",
  QUALITY_DISPOSITION_SOURCE_REVERSED: "Nguồn hàng đã bị hoàn tác nên không thể xử lý tiếp.",
  QUALITY_DISPOSITION_QUANTITY_EXCEEDS_REMAINING:
    "Số lượng xử lý vượt phần còn lại của nguồn hàng.",
  QUALITY_DISPOSITION_INVALID: "Quyết định xử lý chất lượng không hợp lệ.",
  QUALITY_DISPOSITION_NOT_FOUND: "Không tìm thấy quyết định xử lý chất lượng.",
  QUALITY_DISPOSITION_ALREADY_REVERSED: "Quyết định xử lý chất lượng đã được hoàn tác.",
  QUALITY_DISPOSITION_HAS_DOWNSTREAM_FACTS:
    "Lô tạm giữ đã được xử lý tiếp nên không thể hoàn tác quyết định trước.",
  COST_OBSERVATION_CORRECTION_TARGET_REQUIRED:
    "Bản ghi điều chỉnh phải chỉ rõ quan sát nguồn cần sửa.",
  COST_OBSERVATION_CORRECTION_TARGET_NOT_FOUND: "Không tìm thấy thông tin nguồn trong vựa này.",
  COST_OBSERVATION_CORRECTION_LINK_INVALID:
    "Chỉ quan sát điều chỉnh mới được liên kết với bản ghi trước.",
  COST_OBSERVATION_NOT_FOUND: "Không tìm thấy quan sát chi phí hoặc hao hụt.",
  COST_OBSERVATION_ALREADY_RECORDED: "Quan sát chi phí hoặc hao hụt đã được ghi nhận.",
  RECONCILIATION_OBSERVATION_CORRECTION_TARGET_REQUIRED:
    "Bản điều chỉnh đối soát phải chỉ rõ quan sát gốc.",
  RECONCILIATION_OBSERVATION_CORRECTION_TARGET_NOT_FOUND:
    "Không tìm thấy thông tin đối soát gốc trong vựa này.",
  RECONCILIATION_OBSERVATION_CORRECTION_LINK_INVALID:
    "Chỉ bản điều chỉnh mới được liên kết tới quan sát trước.",
  RECONCILIATION_OBSERVATION_NOT_FOUND: "Không tìm thấy quan sát đối soát.",
  RECONCILIATION_OBSERVATION_ALREADY_RECORDED: "Quan sát đối soát đã được ghi nhận.",
  DEBT_OBSERVATION_CORRECTION_TARGET_REQUIRED:
    "Bản điều chỉnh công nợ phải chỉ rõ quan sát cần điều chỉnh.",
  DEBT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND:
    "Không tìm thấy thông tin công nợ cần điều chỉnh trong vựa này.",
  DEBT_OBSERVATION_CORRECTION_LINK_INVALID:
    "Chỉ bản quan sát điều chỉnh mới được liên kết quan sát trước đó.",
  DEBT_OBSERVATION_NOT_FOUND: "Không tìm thấy quan sát điều khoản công nợ.",
  DEBT_OBSERVATION_ALREADY_RECORDED: "Quan sát điều khoản công nợ đã được ghi nhận.",
  SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_TARGET_REQUIRED:
    "Quan sát điều chỉnh nguồn cung phải chỉ rõ quan sát gốc.",
  SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND:
    "Không tìm thấy quan sát nguồn cung cần điều chỉnh trong vựa này.",
  SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_LINK_INVALID:
    "Chỉ quan sát điều chỉnh mới được liên kết tới quan sát trước đó.",
  SUPPLY_COMMITMENT_OBSERVATION_NOT_FOUND: "Không tìm thấy quan sát cam kết nguồn cung.",
  SUPPLY_COMMITMENT_OBSERVATION_ALREADY_RECORDED: "Quan sát cam kết nguồn cung đã được ghi nhận.",
  COMMAND_NOT_AVAILABLE: "Chức năng này chưa có.",
};

/**
 * Copy for a code, with an honest fallback.
 *
 * New codes are added over time and an old client will meet them. Falling back to
 * the server's message — clearly worse copy, but true — beats rendering nothing
 * or crashing (error-contract rule 4).
 */
export function messageForCode(code: DomainRejectionCode, serverMessage?: string): string {
  return REJECTION_COPY[code] ?? serverMessage ?? "Không thực hiện được. Hãy thử lại.";
}

export const DELIVERY_STATUS_COPY: Readonly<Record<DeliveryStatus, string>> = {
  ...UI_COPY_REGISTRY.status.delivery,
};

export const PURCHASE_STATUS_COPY: Readonly<Record<PurchaseStatus, string>> = {
  ...UI_COPY_REGISTRY.status.purchase,
};

export const SALE_STATUS_COPY: Readonly<Record<SaleStatus, string>> = {
  ...UI_COPY_REGISTRY.status.sale,
};

export const SALE_DUE_COPY: Readonly<Record<SaleDueState, string>> = {
  // Empty on purpose: no term agreed is the ordinary case for a depot sale, and
  // a chip on every sale is read as decoration within a week (BR-SALE-017).
  no_due_date: "",
  due: "Đến hạn",
  overdue: "Quá hạn",
};

export const PAYMENT_STATUS_COPY: Readonly<Record<PaymentStatus, string>> = {
  recorded: "Đã thu",
  partially_reversed: "Hoàn một phần",
  reversed: "Đã hoàn hết",
};

/** Labels for the states the UI state catalog names, used by notices and stories. */
export const UI_STATE_COPY = {
  loading: "Đang tải…",
  empty: "Chưa có gì ở đây",
  permission_denied: "Không đủ quyền",
  stale_version: "Dữ liệu đã thay đổi",
  duplicate_safe_retry: "Đã ghi nhận",
  command_in_progress: "Đang xử lý",
  unknown_network_outcome: "Chưa rõ kết quả",
  membership_revoked: "Quyền truy cập đã bị thu hồi",
} as const;
