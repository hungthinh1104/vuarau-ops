import type {
  DomainRejectionCode,
  PaymentStatus,
  SaleDueState,
  SaleStatus,
} from "@vuarau/domain-contracts";

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
const REJECTION_COPY: Readonly<Record<DomainRejectionCode, string>> = {
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

  CUSTOMER_NOT_FOUND: "Không tìm thấy khách hàng này.",
  CUSTOMER_NAME_REQUIRED: "Tên khách hàng không được để trống.",
  CUSTOMER_VERSION_CONFLICT: "Người khác vừa sửa khách hàng này. Hãy tải lại để xem thay đổi.",
  CUSTOMER_ALREADY_INACTIVE: "Khách hàng này đã ngưng hoạt động.",
  CUSTOMER_ALREADY_ACTIVE: "Khách hàng này đang hoạt động.",
  PRODUCT_NOT_FOUND: "Không tìm thấy mặt hàng trong vựa này.",
  PRODUCT_VERSION_CONFLICT: "Mặt hàng đã được người khác cập nhật.",
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
  PURCHASE_HAS_ACTIVE_RECEIPTS: "Phải hoàn tác toàn bộ phiếu nhận hàng trước khi hoàn tác đơn mua.",
  PURCHASE_VOID_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tác đơn mua.",
  RECEIPT_NOT_FOUND: "Không tìm thấy phiếu nhận hàng.",
  RECEIPT_ALREADY_REVERSED: "Phiếu nhận hàng đã được hoàn tác.",
  RECEIPT_QUANTITY_EXCEEDS_PURCHASE: "Số lượng nhận vượt số lượng đã mua.",
  RECEIPT_UNIT_MISMATCH: "Đơn vị nhận hàng không khớp dòng mua.",
  RECEIPT_REVERSAL_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tác nhận hàng.",
  INVENTORY_ADJUSTMENT_REASON_REQUIRED: "Điều chỉnh tồn kho phải có lý do.",
  INVENTORY_RECONCILIATION_INTEGRITY_FAILURE: "Sổ chuyển động tồn kho có dữ liệu không toàn vẹn.",

  SALE_NOT_FOUND: "Không tìm thấy đơn hàng này.",
  SALE_EMPTY: "Đơn chưa có mặt hàng nào. Hãy thêm ít nhất một dòng trước khi chốt.",
  SALE_LINE_INVALID: "Có dòng hàng chưa hợp lệ. Kiểm tra số lượng và đơn giá.",
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
  SALE_REPLACEMENT_NOT_VOIDED: "Chỉ tạo đơn thay thế sau khi đơn gốc đã được hoàn tác.",
  SALE_REPLACEMENT_ALREADY_EXISTS: "Đơn này đã có một đơn thay thế trong chuỗi điều chỉnh.",
  SALE_REPLACEMENT_ACTOR_MISMATCH:
    "Chỉ người đã hoàn tác đơn mới có thể tiếp tục tạo đơn thay thế.",
  SALE_REPLACEMENT_CUSTOMER_UNCHANGED:
    "Với lý do sai khách hàng, hãy chọn một khách hàng khác cho đơn thay thế.",
  SALE_REPLACEMENT_CURRENCY_MISMATCH: "Đơn thay thế phải dùng cùng loại tiền với đơn gốc.",

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

export const SALE_STATUS_COPY: Readonly<Record<SaleStatus, string>> = {
  draft: "Nháp",
  posted: "Đã chốt",
  discarded: "Đã bỏ",
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
