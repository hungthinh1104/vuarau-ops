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
  WORKSPACE_POLICY_ALREADY_EXISTS: "Phiên bản policy này đã tồn tại trong vựa.",
  WORKSPACE_POLICY_NOT_FOUND: "Không tìm thấy phiên bản policy này.",
  WORKSPACE_POLICY_NOT_DRAFT: "Chỉ policy ở trạng thái nháp mới có thể được duyệt.",
  WORKSPACE_POLICY_NOT_APPROVED: "Policy này đã được ngừng hiệu lực.",
  WORKSPACE_POLICY_EVIDENCE_REQUIRED: "Cần ít nhất một tham chiếu bằng chứng để duyệt policy.",
  WORKSPACE_POLICY_VERSION_CONFLICT: "Policy vừa được người khác thay đổi. Hãy tải lại.",
  WORKSPACE_POLICY_EFFECTIVE_RANGE_INVALID: "Khoảng hiệu lực của policy không hợp lệ.",

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
    "Chưa có policy sửa đơn mua sau receiving được workspace phê duyệt và đang hiệu lực.",
  PURCHASE_VOID_REASON_REQUIRED: "Cần ghi rõ lý do hoàn tác đơn mua.",
  RECEIPT_NOT_FOUND: "Không tìm thấy phiếu nhận hàng.",
  RECEIPT_ALREADY_REVERSED: "Phiếu nhận hàng đã được hoàn tác.",
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
  GOODS_ARRIVAL_NOT_FOUND: "Không tìm thấy lần hàng đến này.",
  GOODS_ARRIVAL_ALREADY_REVERSED: "Lần hàng đến đã được hoàn tác.",
  GOODS_ARRIVAL_HAS_DOWNSTREAM_FACTS:
    "Lần hàng đến đã có kiểm định hoặc quyết định xử lý nên không thể hoàn tác trực tiếp.",
  GOODS_ARRIVAL_LINE_INVALID: "Có dòng hàng đến không hợp lệ.",
  GOODS_ARRIVAL_PURCHASE_MISMATCH: "Hàng đến không khớp nhà cung cấp hoặc dòng mua đã chọn.",
  WEIGHING_REQUIRED: "Vựa này yêu cầu ghi cân tổng, bì và khối lượng tịnh.",
  WEIGHING_NOT_USED: "Vựa này không sử dụng quy trình cân tổng–bì–tịnh.",
  WEIGHING_INVALID: "Số cân không hợp lệ; khối lượng tịnh phải bằng tổng trừ bì.",
  QUALITY_INSPECTION_NOT_FOUND: "Không tìm thấy lần kiểm định chất lượng.",
  QUALITY_INSPECTION_ALREADY_REVERSED: "Lần kiểm định đã được hoàn tác.",
  QUALITY_INSPECTION_QUANTITY_EXCEEDS_ARRIVAL: "Số lượng kiểm định vượt số hàng đến.",
  QUALITY_INSPECTION_INVALID: "Nội dung kiểm định chất lượng không hợp lệ.",
  QUALITY_INSPECTION_HAS_DOWNSTREAM_FACTS:
    "Kiểm định đã được dùng để xử lý hàng nên không thể hoàn tác trực tiếp.",
  QUALITY_DISPOSITION_SOURCE_NOT_FOUND: "Không tìm thấy nguồn hàng cần xử lý chất lượng.",
  QUALITY_DISPOSITION_SOURCE_REVERSED: "Nguồn hàng đã bị hoàn tác nên không thể xử lý tiếp.",
  QUALITY_DISPOSITION_QUANTITY_EXCEEDS_REMAINING:
    "Số lượng xử lý vượt phần còn lại của nguồn hàng.",
  QUALITY_DISPOSITION_INVALID: "Quyết định xử lý chất lượng không hợp lệ.",
  QUALITY_DISPOSITION_NOT_FOUND: "Không tìm thấy quyết định xử lý chất lượng.",
  QUALITY_DISPOSITION_ALREADY_REVERSED: "Quyết định xử lý chất lượng đã được hoàn tác.",
  QUALITY_DISPOSITION_HAS_DOWNSTREAM_FACTS:
    "Lô cách ly đã được xử lý tiếp nên không thể hoàn tác quyết định trước.",
  COST_OBSERVATION_CORRECTION_TARGET_REQUIRED:
    "Bản ghi điều chỉnh phải chỉ rõ quan sát nguồn cần sửa.",
  COST_OBSERVATION_CORRECTION_TARGET_NOT_FOUND:
    "Không tìm thấy quan sát nguồn trong workspace này.",
  COST_OBSERVATION_CORRECTION_LINK_INVALID:
    "Chỉ quan sát điều chỉnh mới được liên kết với bản ghi trước.",
  COST_OBSERVATION_NOT_FOUND: "Không tìm thấy quan sát chi phí hoặc hao hụt.",
  COST_OBSERVATION_ALREADY_RECORDED: "Quan sát chi phí hoặc hao hụt đã được ghi nhận.",
  RECONCILIATION_OBSERVATION_CORRECTION_TARGET_REQUIRED:
    "Bản điều chỉnh đối soát phải chỉ rõ quan sát gốc.",
  RECONCILIATION_OBSERVATION_CORRECTION_TARGET_NOT_FOUND:
    "Không tìm thấy quan sát đối soát gốc trong workspace này.",
  RECONCILIATION_OBSERVATION_CORRECTION_LINK_INVALID:
    "Chỉ bản điều chỉnh mới được liên kết tới quan sát trước.",
  RECONCILIATION_OBSERVATION_NOT_FOUND: "Không tìm thấy quan sát đối soát.",
  RECONCILIATION_OBSERVATION_ALREADY_RECORDED: "Quan sát đối soát đã được ghi nhận.",
  DEBT_OBSERVATION_CORRECTION_TARGET_REQUIRED:
    "Bản điều chỉnh công nợ phải chỉ rõ quan sát cần điều chỉnh.",
  DEBT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND:
    "Không tìm thấy quan sát công nợ cần điều chỉnh trong workspace này.",
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
  draft: "Cần xuất hàng",
  dispatched: "Đang giao",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
};

export const PURCHASE_STATUS_COPY: Readonly<Record<PurchaseStatus, string>> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  discarded: "Đã bỏ",
};

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
