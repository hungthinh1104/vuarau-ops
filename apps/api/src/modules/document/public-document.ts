import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AccountTimelineEntryDto,
  DocumentDto,
  DocumentSnapshot,
  Money,
  Quantity,
} from "@vuarau/domain-contracts";
import {
  CURRENCY_EXPONENT,
  documentSnapshotSchema,
  QUANTITY_SCALE,
  UNIT_LABEL_VI,
} from "@vuarau/domain-contracts";
import { hashPayload } from "../../infrastructure/hash.ts";
import type { CommandDeps } from "../shared/command-pipeline.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const VI_DATE = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const VI_DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string): string {
  return VI_DATE.format(new Date(value));
}

function formatInstant(value: string): string {
  return VI_DATE_TIME.format(new Date(value));
}

function formatMoney(value: Money, signed = false): string {
  const exponent = CURRENCY_EXPONENT[value.currency];
  const magnitude = Math.abs(value.amountMinor) / 10 ** exponent;
  const number = new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(magnitude);
  const sign = signed ? (value.amountMinor < 0 ? "−" : value.amountMinor > 0 ? "+" : "") : "";
  return `${sign}${number} ₫`;
}

function formatQuantity(value: Quantity): string {
  const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(
    value.valueScaled / QUANTITY_SCALE,
  );
  return `${number} ${UNIT_LABEL_VI[value.unit]}`;
}

function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

const ENTRY_LABEL: Readonly<Record<AccountTimelineEntryDto["source"]["type"], string>> = {
  sale_posting: "Đơn bán",
  sale_void: "Hoàn tác đơn",
  payment: "Thanh toán",
  payment_reversal: "Hoàn tác thanh toán",
  manual_adjustment: "Điều chỉnh công nợ",
};

function rows(values: readonly (readonly string[])[]): string {
  return values
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
}

function documentHeader(args: {
  title: string;
  workspaceName: string;
  partyName: string;
  partyPhone: string | null;
  document: DocumentDto;
}): string {
  return `<header><p class="workspace">${escapeHtml(args.workspaceName)}</p><h1>${escapeHtml(args.title)}</h1><p class="muted">Mã ${shortReference(args.document.id)} · Phiên bản ${args.document.version}</p><div class="meta"><p><strong>Đối tác:</strong> ${escapeHtml(args.partyName)}</p>${args.partyPhone === null ? "" : `<p><strong>Điện thoại:</strong> ${escapeHtml(args.partyPhone)}</p>`}</div></header>`;
}

function documentFooter(document: DocumentDto): string {
  return `<footer><p>Tạo lúc ${escapeHtml(formatInstant(document.generatedAt))} · Mã kiểm tra ${escapeHtml(document.digest.slice(0, 12))}</p><p><strong>Bản chụp nghiệp vụ từ dữ liệu hệ thống; không phải hóa đơn thuế hoặc chứng từ điện tử có chữ ký số.</strong></p></footer>`;
}

function signature(left: string, right: string): string {
  return `<div class="signatures"><div><strong>${escapeHtml(left)}</strong><span>Ký và ghi rõ họ tên</span></div><div><strong>${escapeHtml(right)}</strong><span>Ký và ghi rõ họ tên</span></div></div>`;
}

function renderSaleReceipt(
  snapshot: Extract<DocumentSnapshot, { kind: "sale_receipt" }>,
  document: DocumentDto,
): string {
  return `${documentHeader({ title: "PHIẾU BÁN HÀNG", workspaceName: snapshot.workspace.name, partyName: snapshot.customer.displayName, partyPhone: snapshot.customer.phone, document })}<p><strong>Ngày bán:</strong> ${escapeHtml(formatInstant(snapshot.sale.transactionTime))} · <strong>Mã đơn:</strong> ${shortReference(snapshot.sale.id)}</p><table><thead><tr><th>Mặt hàng</th><th>Phẩm cấp</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${rows(snapshot.sale.lines.map((line) => [line.productName, line.qualityGradeName ?? "Chưa phân hạng", formatQuantity(line.quantity), formatMoney(line.unitPrice), formatMoney(line.lineTotal)]))}</tbody></table><p class="total"><span>Tổng đơn</span><strong>${formatMoney(snapshot.sale.totalAmount)}</strong></p>${snapshot.sale.note === null ? "" : `<p><strong>Ghi chú:</strong> ${escapeHtml(snapshot.sale.note)}</p>`}${signature("Người lập phiếu", "Khách hàng")}${documentFooter(document)}`;
}

function periodLabel(from: string | null, to: string | null): string {
  if (from === null && to === null) return "Toàn bộ lịch sử";
  if (from !== null && to !== null) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from !== null) return `Từ ${formatDate(from)}`;
  return `Đến ${formatDate(to!)}`;
}

function renderStatement(
  snapshot: Extract<DocumentSnapshot, { kind: "customer_statement" }>,
  document: DocumentDto,
): string {
  const closingLabel =
    snapshot.classification === "receivable"
      ? "Còn nợ"
      : snapshot.classification === "customer_credit"
        ? "Vựa nợ khách"
        : "Hết nợ";
  const entryRows =
    snapshot.entries.length === 0
      ? `<tr><td colspan="5" class="empty">Không có phát sinh trong kỳ.</td></tr>`
      : rows(
          snapshot.entries.map((entry) => [
            formatDate(entry.transactionTime),
            `${ENTRY_LABEL[entry.source.type]}${entry.reason === null ? "" : ` · ${entry.reason}`}`,
            shortReference(entry.source.document.id),
            formatMoney(entry.amount, true),
            formatMoney(entry.runningBalance),
          ]),
        );
  return `${documentHeader({ title: "SAO KÊ CÔNG NỢ", workspaceName: snapshot.workspace.name, partyName: snapshot.customer.displayName, partyPhone: snapshot.customer.phone, document })}<p><strong>Kỳ sao kê:</strong> ${escapeHtml(periodLabel(snapshot.period.from, snapshot.period.to))}</p><table><thead><tr><th>Ngày</th><th>Nội dung</th><th>Mã nguồn</th><th>Phát sinh</th><th>Số dư</th></tr></thead><tbody>${entryRows}</tbody></table><dl class="summary"><dt>Số dư đầu kỳ</dt><dd>${formatMoney(snapshot.openingBalance)}</dd><dt>Phát sinh trong kỳ</dt><dd>${formatMoney(snapshot.periodChange, true)}</dd><dt>${escapeHtml(closingLabel)}</dt><dd>${formatMoney(snapshot.closingBalance)}</dd></dl>${signature("Người đối chiếu", "Khách hàng xác nhận")}${documentFooter(document)}`;
}

function renderPurchaseOrder(
  snapshot: Extract<DocumentSnapshot, { kind: "purchase_order" }>,
  document: DocumentDto,
): string {
  return `${documentHeader({ title: "ĐƠN MUA HÀNG", workspaceName: snapshot.workspace.name, partyName: snapshot.supplier.displayName, partyPhone: snapshot.supplier.phone, document })}<p><strong>Ngày mua:</strong> ${escapeHtml(formatInstant(snapshot.purchase.transactionTime))} · <strong>Mã đơn:</strong> ${shortReference(snapshot.purchase.id)}</p><table><thead><tr><th>Mặt hàng</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${rows(snapshot.purchase.lines.map((line) => [line.productName, formatQuantity(line.quantity), formatMoney(line.unitPrice), formatMoney(line.lineTotal)]))}</tbody></table><p class="total"><span>Tổng đơn mua</span><strong>${formatMoney(snapshot.purchase.totalAmount)}</strong></p>${signature("Người đặt hàng", "Nhà cung cấp")}${documentFooter(document)}`;
}

function renderDeliveryNote(
  snapshot: Extract<DocumentSnapshot, { kind: "delivery_note" }>,
  document: DocumentDto,
): string {
  return `${documentHeader({ title: "PHIẾU GIAO HÀNG", workspaceName: snapshot.workspace.name, partyName: snapshot.customer.displayName, partyPhone: snapshot.customer.phone, document })}<p><strong>Ngày giao:</strong> ${escapeHtml(formatInstant(snapshot.delivery.transactionTime))} · <strong>Mã giao:</strong> ${shortReference(snapshot.delivery.id)} · <strong>Đơn:</strong> ${shortReference(snapshot.delivery.saleId)}</p><table><thead><tr><th>Mặt hàng</th><th>Phẩm cấp</th><th>Giao</th><th>Đã trả</th></tr></thead><tbody>${rows(snapshot.delivery.lines.map((line) => [line.productName, line.qualityGradeName ?? "Chưa phân hạng", formatQuantity(line.quantity), formatQuantity(line.returnedQuantity)]))}</tbody></table>${signature("Người giao", "Người nhận")}${documentFooter(document)}`;
}

function renderDocumentBody(document: DocumentDto): string {
  const parsed = documentSnapshotSchema.safeParse(document.snapshot);
  if (!parsed.success) {
    return `<header><h1>Chứng từ phiên bản cũ</h1></header><p>Snapshot vẫn được kiểm tra digest nhưng chưa có schema trình bày mới.</p><pre>${escapeHtml(JSON.stringify(document.snapshot, null, 2))}</pre>${documentFooter(document)}`;
  }
  switch (parsed.data.kind) {
    case "sale_receipt":
      return renderSaleReceipt(parsed.data, document);
    case "customer_statement":
      return renderStatement(parsed.data, document);
    case "purchase_order":
      return renderPurchaseOrder(parsed.data, document);
    case "delivery_note":
      return renderDeliveryNote(parsed.data, document);
  }
}

function documentHtml(document: DocumentDto): string {
  const body = renderDocumentBody(document);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.documentType.replaceAll("_", " "))}</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#17211b;margin:0;background:#f7f8f6}.sheet{max-width:210mm;margin:24px auto;background:white;padding:12mm}.workspace{text-transform:uppercase;font-weight:700;letter-spacing:.05em}header{text-align:center;border-bottom:2px solid #17211b;padding-bottom:16px}header h1{margin:8px 0}.muted,footer{color:#657068}.meta{display:grid;grid-template-columns:1fr 1fr;text-align:left;margin-top:16px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #d8ded9;padding:8px;vertical-align:top}th{background:#f0f3ef;text-align:left}th:nth-last-child(-n+2),td:nth-last-child(-n+2){text-align:right;font-variant-numeric:tabular-nums}.total{display:flex;justify-content:space-between;margin-left:auto;max-width:360px;border-top:1px solid #d8ded9;padding-top:12px}.summary{display:grid;grid-template-columns:1fr auto;gap:8px 24px;margin-left:auto;max-width:420px;border-top:1px solid #d8ded9;padding-top:12px}.summary dd{margin:0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:48px;text-align:center;margin-top:48px}.signatures span{display:block;margin-top:64px;color:#657068;font-size:12px}footer{border-top:1px solid #d8ded9;margin-top:32px;padding-top:12px;font-size:12px}.empty{text-align:center!important;color:#657068;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{background:white}.sheet{max-width:none;margin:0;padding:0}thead{display:table-header-group}tr,td,th{break-inside:avoid}}</style></head><body><main class="sheet">${body}</main></body></html>`;
}

export async function getPublicDocument(deps: CommandDeps, token: string) {
  const result = await deps.uow.transaction((repos) =>
    repos.documentReads.publicByTokenHash(hashPayload(token), deps.clock.now()),
  );
  if (result.kind !== "found") return result;
  if (hashPayload(result.document.snapshot) !== result.document.digest)
    return { kind: "integrity_error" as const };
  return {
    kind: "found" as const,
    document: result.document,
    html: documentHtml(result.document),
  };
}

export function createPublicDocumentHandler(
  deps: CommandDeps,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    const match = /^\/public\/documents\/([A-Za-z0-9_-]{32,})$/.exec(path);
    if (match === null || req.method !== "GET") return false;
    const result = await getPublicDocument(deps, match[1]!);
    if (result.kind !== "found") {
      const status =
        result.kind === "not_found" ? 404 : result.kind === "integrity_error" ? 409 : 410;
      res.writeHead(status, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        status === 404
          ? "Document not found"
          : status === 409
            ? "Document integrity check failed"
            : "Document link unavailable",
      );
      return true;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });
    res.end(result.html);
    return true;
  };
}
