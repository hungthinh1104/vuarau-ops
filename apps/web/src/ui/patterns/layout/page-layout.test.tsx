import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-layout.tsx";

describe("PageHeader", () => {
  it("renders title alone", () => {
    render(<PageHeader title="Khách hàng" />);
    expect(screen.getByRole("heading", { name: "Khách hàng" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders back navigation when requested", () => {
    render(
      <PageHeader title="Sửa hồ sơ" back={{ href: "/customers/123", label: "Quay lại hồ sơ" }} />,
    );
    const link = screen.getByRole("link", { name: "Quay lại hồ sơ" });
    expect(link).toHaveAttribute("href", "/customers/123");
    expect(link).toHaveClass("touch-target");
    // ArrowLeft SVG is decorative for screen readers when nested inside link with label text
    // We just verify the link has the correct text and href.
    expect(link).toBeInTheDocument();
  });

  it("renders description and actions", () => {
    render(
      <PageHeader
        title="Tiêu đề"
        description="Mô tả chi tiết"
        actions={<button type="button">Xóa</button>}
      />,
    );
    expect(screen.getByText("Mô tả chi tiết")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xóa" })).toBeInTheDocument();
  });

  it("renders status", () => {
    render(
      <PageHeader title="Đơn hàng" status={<span data-testid="status-badge">Hoàn thành</span>} />,
    );
    expect(screen.getByTestId("status-badge")).toBeInTheDocument();
    expect(screen.getByText("Hoàn thành")).toBeInTheDocument();
  });
});
