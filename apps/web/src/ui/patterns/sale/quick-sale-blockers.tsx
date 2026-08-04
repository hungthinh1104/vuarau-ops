"use client";

import { Button } from "@/ui/primitives/button.tsx";

export function QuickSaleGradeState(props: {
  readonly loading: boolean;
  readonly error: boolean;
  readonly gradeCount: number;
  readonly required?: boolean;
}) {
  if (props.required === false) {
    return (
      <p role="status" className="text-caption text-ink-muted">
        Vựa này không dùng phẩm cấp; đơn sẽ giữ nguyên mặt hàng và đơn vị.
      </p>
    );
  }
  if (props.gradeCount > 0) return null;
  if (props.loading) {
    return (
      <p role="status" className="text-caption text-ink-muted">
        Đang tải phẩm cấp…
      </p>
    );
  }
  if (props.error) {
    return (
      <p role="alert" className="text-caption text-danger">
        Không tải được phẩm cấp. Chưa thể chốt đơn.
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
    >
      Vựa chưa cấu hình phẩm cấp đang dùng. Theo chính sách hiện tại chưa thể chốt đơn; đừng tạo
      phẩm cấp giả chỉ để bỏ qua ASM-032.
    </p>
  );
}

export function QuickSaleUnresolvedProduct(props: {
  readonly productName: string;
  readonly mayCreateProduct: boolean;
  readonly locked: boolean;
  readonly creating: boolean;
  readonly onCreate: () => void;
}) {
  return (
    <section
      role="status"
      className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
    >
      <p className="font-semibold">Mặt hàng chưa có trong danh mục</p>
      <p className="mt-1 text-ink-muted">
        Đơn đã chốt phải giữ Product canonical để Delivery và tồn kho không đoán từ tên hiển thị.
      </p>
      {props.mayCreateProduct ? (
        <Button
          className="mt-2"
          tone="secondary"
          disabled={props.locked || props.creating}
          onClick={props.onCreate}
        >
          {props.creating ? "Đang tạo…" : `Tạo mặt hàng "${props.productName.trim()}"`}
        </Button>
      ) : (
        <p className="mt-1 text-ink-muted">
          Bạn không có quyền tạo mặt hàng. Hãy chọn mặt hàng có sẵn hoặc nhờ chủ vựa.
        </p>
      )}
    </section>
  );
}
