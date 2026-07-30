"use client";

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
        <input
          value={props.displayName}
          onChange={(event) => props.onDisplayName(event.target.value)}
          className="mt-1 w-full rounded-button border border-border px-3 py-2"
          autoFocus
        />
      </label>
      <label className="text-label">
        Số điện thoại
        <input
          value={props.phone}
          onChange={(event) => props.onPhone(event.target.value)}
          className="mt-1 w-full rounded-button border border-border px-3 py-2"
          inputMode="tel"
        />
      </label>
      <label className="text-label">
        Ghi chú
        <textarea
          value={props.note}
          onChange={(event) => props.onNote(event.target.value)}
          className="mt-1 w-full rounded-button border border-border px-3 py-2"
        />
      </label>
    </div>
  );
}
