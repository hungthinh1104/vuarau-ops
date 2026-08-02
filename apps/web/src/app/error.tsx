"use client";

import { Button } from "@/ui/primitives/button.tsx";

export default function Error({ reset }: { readonly reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col justify-center gap-4 px-4 py-10">
      <p className="text-caption font-semibold uppercase tracking-wide text-danger">Có lỗi</p>
      <h1 className="text-heading font-bold">Trang chưa thể hiển thị</h1>
      <p className="text-body text-ink-muted">
        Dữ liệu chưa được xác nhận. Thử tải lại; nếu lỗi lặp lại, báo mã hỗ trợ cho người quản trị.
      </p>
      <Button className="self-start" onClick={reset}>
        Thử lại
      </Button>
    </main>
  );
}
