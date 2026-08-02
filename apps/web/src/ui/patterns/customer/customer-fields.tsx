"use client";

import { Input, TextareaControl } from "@/ui/primitives/index.ts";

export function CustomerFields(props: {
  displayName: string;
  phone: string;
  note: string;
  onDisplayName: (value: string) => void;
  onPhone: (value: string) => void;
  onNote: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-label">
        Tên khách hàng
        <Input
          value={props.displayName}
          onChange={(event) => props.onDisplayName(event.target.value)}
          className="mt-1"
          autoFocus
        />
      </label>
      <label className="text-label">
        Số điện thoại
        <Input
          value={props.phone}
          onChange={(event) => props.onPhone(event.target.value)}
          className="mt-1"
          inputMode="tel"
        />
      </label>
      <label className="text-label">
        Ghi chú
        <TextareaControl
          value={props.note}
          onChange={(event) => props.onNote(event.target.value)}
          className="mt-1"
        />
      </label>
    </div>
  );
}
