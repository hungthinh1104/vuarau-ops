"use client";

import { TextInput, Textarea } from "@/ui/primitives/index.ts";

export function CustomerFields(props: {
  displayName: string;
  phone: string;
  note: string;
  onDisplayName: (value: string) => void;
  onPhone: (value: string) => void;
  onNote: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 w-full">
      <TextInput
        label="Tên khách hàng"
        value={props.displayName}
        onChange={(event) => props.onDisplayName(event.target.value)}
        autoFocus
      />
      <TextInput
        label="Số điện thoại"
        value={props.phone}
        onChange={(event) => props.onPhone(event.target.value)}
        inputMode="tel"
      />
      <Textarea
        label="Ghi chú"
        value={props.note}
        onChange={(event) => props.onNote(event.target.value)}
      />
    </div>
  );
}
