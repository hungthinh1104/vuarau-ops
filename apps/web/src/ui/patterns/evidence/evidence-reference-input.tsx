"use client";

import { Textarea } from "@/ui/primitives/textarea.tsx";

const DEFAULT_HINT =
  "Mỗi dòng một tham chiếu tới ảnh, phiếu, biên nhận, tin nhắn hoặc liên kết đã được duyệt.";

export type EvidenceReferenceInputProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly label?: string;
  readonly hint?: string;
};

/**
 * Captures references to existing operational evidence. It deliberately does
 * not imply binary upload or a new evidence record until those contracts exist.
 */
export function EvidenceReferenceInput({
  value,
  onChange,
  disabled = false,
  required = false,
  label = "Ảnh hoặc phiếu liên quan",
  hint = DEFAULT_HINT,
}: EvidenceReferenceInputProps) {
  return (
    <Textarea
      label={label}
      hint={hint}
      value={value}
      disabled={disabled}
      required={required}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
