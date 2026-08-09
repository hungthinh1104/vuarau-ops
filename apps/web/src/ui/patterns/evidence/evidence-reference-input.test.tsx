import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceReferenceInput } from "./evidence-reference-input.tsx";

describe("EvidenceReferenceInput", () => {
  it("keeps evidence as references and exposes the shared Vietnamese contract", () => {
    render(<EvidenceReferenceInput value="" onChange={() => undefined} />);

    expect(screen.getByLabelText("Ảnh hoặc phiếu liên quan")).toBeInTheDocument();
    expect(screen.getByText(/Mỗi dòng một tham chiếu/)).toBeInTheDocument();
  });
});
