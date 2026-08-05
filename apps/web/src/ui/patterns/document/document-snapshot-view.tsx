import type {
  AccountTimelineEntryDto,
  DocumentDto,
  DocumentSnapshot,
  Money,
} from "@vuarau/domain-contracts";
import { documentSnapshotSchema } from "@vuarau/domain-contracts";
import {
  describeBalance,
  formatDate,
  formatInstant,
  formatMoney,
  formatQuantity,
  formatSignedMoney,
} from "@/ui/format.ts";

const DOCUMENT_TITLE: Readonly<Record<DocumentSnapshot["kind"], string>> = {
  sale_receipt: "PHIẾU BÁN HÀNG",
  customer_statement: "SAO KÊ CÔNG NỢ",
  purchase_order: "ĐƠN MUA HÀNG",
  delivery_note: "PHIẾU GIAO HÀNG",
};

const ENTRY_LABEL: Readonly<Record<AccountTimelineEntryDto["source"]["type"], string>> = {
  sale_posting: "Đơn bán",
  sale_void: "Hoàn tác đơn",
  payment: "Thanh toán",
  payment_reversal: "Hoàn tác thanh toán",
  manual_adjustment: "Điều chỉnh công nợ",
};

function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function periodLabel(from: string | null, to: string | null): string {
  if (from === null && to === null) return "Toàn bộ lịch sử";
  if (from !== null && to !== null) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from !== null) return `Từ ${formatDate(from)}`;
  return `Đến ${formatDate(to!)}`;
}

function DocumentHeader(props: {
  readonly snapshot: DocumentSnapshot;
  readonly document: DocumentDto;
  readonly partyName: string;
  readonly partyPhone?: string | null;
}) {
  return (
    <header className="border-b-2 border-ink pb-4 text-center">
      <p className="text-label font-semibold uppercase tracking-wide">
        {props.snapshot.workspace.name}
      </p>
      <h1 className="mt-2 text-heading font-bold">{DOCUMENT_TITLE[props.snapshot.kind]}</h1>
      <p className="mt-1 text-body-sm text-ink-muted">
        Mã {shortReference(props.document.id)} · Phiên bản {props.document.version}
      </p>
      <div className="mt-4 grid gap-1 text-left text-body-sm sm:grid-cols-2">
        <p>
          <strong>Đối tác:</strong> {props.partyName}
        </p>
        {props.partyPhone ? (
          <p>
            <strong>Điện thoại:</strong> {props.partyPhone}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function DocumentFooter(props: { readonly document: DocumentDto }) {
  return (
    <footer className="mt-8 border-t border-border pt-3 text-caption text-ink-muted">
      <div className="grid gap-1 sm:grid-cols-2">
        <p>Tạo lúc {formatInstant(props.document.generatedAt)}</p>
        <p className="sm:text-right">Mã kiểm tra {props.document.digest.slice(0, 12)}</p>
      </div>
      <p className="mt-2 font-semibold">
        Bản chụp nghiệp vụ từ dữ liệu hệ thống; không phải hóa đơn thuế hoặc chứng từ điện tử có chữ
        ký số.
      </p>
    </footer>
  );
}

function SignatureRows(props: { readonly left: string; readonly right: string }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-8 text-center text-body-sm print:break-inside-avoid">
      <div>
        <p className="font-semibold">{props.left}</p>
        <p className="mt-16 text-caption text-ink-muted">Ký và ghi rõ họ tên</p>
      </div>
      <div>
        <p className="font-semibold">{props.right}</p>
        <p className="mt-16 text-caption text-ink-muted">Ký và ghi rõ họ tên</p>
      </div>
    </div>
  );
}

function MoneySummary(props: {
  readonly rows: readonly {
    readonly label: string;
    readonly value: Money;
    readonly signed?: boolean;
  }[];
}) {
  return (
    <dl className="ml-auto mt-4 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-t border-border pt-3 text-body-sm">
      {props.rows.map((row) => (
        <div className="contents" key={row.label}>
          <dt>{row.label}</dt>
          <dd className="tabular text-right font-semibold">
            {row.signed ? formatSignedMoney(row.value) : formatMoney(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SaleReceipt(props: {
  readonly snapshot: Extract<DocumentSnapshot, { kind: "sale_receipt" }>;
  readonly document: DocumentDto;
}) {
  const { sale } = props.snapshot;
  return (
    <>
      <DocumentHeader
        snapshot={props.snapshot}
        document={props.document}
        partyName={props.snapshot.customer.displayName}
        partyPhone={props.snapshot.customer.phone}
      />
      <div className="mt-4 grid gap-1 text-body-sm sm:grid-cols-2">
        <p>
          <strong>Ngày bán:</strong> {formatInstant(sale.transactionTime)}
        </p>
        <p>
          <strong>Mã đơn:</strong> {shortReference(sale.id)}
        </p>
      </div>
      <table className="document-table mt-4 w-full text-body-sm">
        <thead>
          <tr>
            <th>Mặt hàng</th>
            <th>Hạng hàng</th>
            <th className="text-right">Số lượng</th>
            <th className="text-right">Đơn giá</th>
            <th className="text-right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((line) => (
            <tr key={line.lineId}>
              <td>{line.productName}</td>
              <td>{line.qualityGradeName ?? "Chưa phân hạng"}</td>
              <td className="tabular text-right">{formatQuantity(line.quantity)}</td>
              <td className="tabular text-right">{formatMoney(line.unitPrice)}</td>
              <td className="tabular text-right font-semibold">{formatMoney(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <MoneySummary rows={[{ label: "Tổng đơn", value: sale.totalAmount }]} />
      {sale.note ? (
        <p className="mt-4 text-body-sm">
          <strong>Ghi chú:</strong> {sale.note}
        </p>
      ) : null}
      <SignatureRows left="Người lập phiếu" right="Khách hàng" />
      <DocumentFooter document={props.document} />
    </>
  );
}

function CustomerStatement(props: {
  readonly snapshot: Extract<DocumentSnapshot, { kind: "customer_statement" }>;
  readonly document: DocumentDto;
}) {
  const summary = describeBalance(props.snapshot.closingBalance, props.snapshot.classification);
  return (
    <>
      <DocumentHeader
        snapshot={props.snapshot}
        document={props.document}
        partyName={props.snapshot.customer.displayName}
        partyPhone={props.snapshot.customer.phone}
      />
      <p className="mt-4 text-body-sm">
        <strong>Kỳ sao kê:</strong>{" "}
        {periodLabel(props.snapshot.period.from, props.snapshot.period.to)}
      </p>
      <table className="document-table mt-4 w-full text-body-sm">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Nội dung</th>
            <th>Mã nguồn</th>
            <th className="text-right">Phát sinh</th>
            <th className="text-right">Số dư</th>
          </tr>
        </thead>
        <tbody>
          {props.snapshot.entries.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-ink-muted">
                Không có phát sinh trong kỳ.
              </td>
            </tr>
          ) : (
            props.snapshot.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.transactionTime)}</td>
                <td>
                  {ENTRY_LABEL[entry.source.type]}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </td>
                <td>{shortReference(entry.source.document.id)}</td>
                <td className="tabular text-right">{formatSignedMoney(entry.amount)}</td>
                <td className="tabular text-right font-semibold">
                  {formatMoney(entry.runningBalance)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <MoneySummary
        rows={[
          { label: "Số dư đầu kỳ", value: props.snapshot.openingBalance },
          { label: "Phát sinh trong kỳ", value: props.snapshot.periodChange, signed: true },
          { label: summary.label, value: props.snapshot.closingBalance },
        ]}
      />
      <SignatureRows left="Người đối chiếu" right="Khách hàng xác nhận" />
      <DocumentFooter document={props.document} />
    </>
  );
}

function PurchaseOrder(props: {
  readonly snapshot: Extract<DocumentSnapshot, { kind: "purchase_order" }>;
  readonly document: DocumentDto;
}) {
  const { purchase } = props.snapshot;
  return (
    <>
      <DocumentHeader
        snapshot={props.snapshot}
        document={props.document}
        partyName={props.snapshot.supplier.displayName}
        partyPhone={props.snapshot.supplier.phone}
      />
      <div className="mt-4 grid gap-1 text-body-sm sm:grid-cols-2">
        <p>
          <strong>Ngày mua:</strong> {formatInstant(purchase.transactionTime)}
        </p>
        <p>
          <strong>Mã đơn:</strong> {shortReference(purchase.id)}
        </p>
      </div>
      <table className="document-table mt-4 w-full text-body-sm">
        <thead>
          <tr>
            <th>Mặt hàng</th>
            <th className="text-right">Số lượng</th>
            <th className="text-right">Đơn giá</th>
            <th className="text-right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {purchase.lines.map((line) => (
            <tr key={line.lineId}>
              <td>{line.productName}</td>
              <td className="tabular text-right">{formatQuantity(line.quantity)}</td>
              <td className="tabular text-right">{formatMoney(line.unitPrice)}</td>
              <td className="tabular text-right font-semibold">{formatMoney(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <MoneySummary rows={[{ label: "Tổng đơn mua", value: purchase.totalAmount }]} />
      {purchase.note ? (
        <p className="mt-4 text-body-sm">
          <strong>Ghi chú:</strong> {purchase.note}
        </p>
      ) : null}
      <SignatureRows left="Người đặt hàng" right="Nhà cung cấp" />
      <DocumentFooter document={props.document} />
    </>
  );
}

function DeliveryNote(props: {
  readonly snapshot: Extract<DocumentSnapshot, { kind: "delivery_note" }>;
  readonly document: DocumentDto;
}) {
  const { delivery } = props.snapshot;
  return (
    <>
      <DocumentHeader
        snapshot={props.snapshot}
        document={props.document}
        partyName={props.snapshot.customer.displayName}
        partyPhone={props.snapshot.customer.phone}
      />
      <div className="mt-4 grid gap-1 text-body-sm sm:grid-cols-2">
        <p>
          <strong>Ngày giao:</strong> {formatInstant(delivery.transactionTime)}
        </p>
        <p>
          <strong>Mã giao:</strong> {shortReference(delivery.id)} · Đơn{" "}
          {shortReference(delivery.saleId)}
        </p>
      </div>
      <table className="document-table mt-4 w-full text-body-sm">
        <thead>
          <tr>
            <th>Mặt hàng</th>
            <th>Hạng hàng</th>
            <th className="text-right">Giao</th>
            <th className="text-right">Đã trả</th>
          </tr>
        </thead>
        <tbody>
          {delivery.lines.map((line) => (
            <tr key={line.deliveryLineId}>
              <td>{line.productName}</td>
              <td>{line.qualityGradeName ?? "Chưa phân hạng"}</td>
              <td className="tabular text-right">{formatQuantity(line.quantity)}</td>
              <td className="tabular text-right">{formatQuantity(line.returnedQuantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {delivery.note ? (
        <p className="mt-4 text-body-sm">
          <strong>Ghi chú:</strong> {delivery.note}
        </p>
      ) : null}
      <SignatureRows left="Người giao" right="Người nhận" />
      <DocumentFooter document={props.document} />
    </>
  );
}

export function DocumentSnapshotView(props: { readonly document: DocumentDto }) {
  const parsed = documentSnapshotSchema.safeParse(props.document.snapshot);
  if (!parsed.success) {
    return (
      <section className="document-sheet rounded-card border border-warning/40 bg-surface p-5">
        <h1 className="text-heading font-bold">Chứng từ phiên bản cũ</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          Snapshot vẫn được kiểm tra digest nhưng chưa có schema trình bày mới.
        </p>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-caption">
          {JSON.stringify(props.document.snapshot, null, 2)}
        </pre>
        <DocumentFooter document={props.document} />
      </section>
    );
  }
  const snapshot = parsed.data;
  return (
    <article className="document-sheet mx-auto w-full max-w-[210mm] bg-surface p-5 text-ink sm:p-8 print:max-w-none print:p-0">
      {snapshot.kind === "sale_receipt" ? (
        <SaleReceipt snapshot={snapshot} document={props.document} />
      ) : null}
      {snapshot.kind === "customer_statement" ? (
        <CustomerStatement snapshot={snapshot} document={props.document} />
      ) : null}
      {snapshot.kind === "purchase_order" ? (
        <PurchaseOrder snapshot={snapshot} document={props.document} />
      ) : null}
      {snapshot.kind === "delivery_note" ? (
        <DeliveryNote snapshot={snapshot} document={props.document} />
      ) : null}
    </article>
  );
}
