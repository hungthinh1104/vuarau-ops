import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DisclosureSection,
  DirectoryToolbar,
  MobileRecordCard,
  PageFrame,
  PageHeader,
} from "./page-layout.tsx";

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

describe("operational layout patterns", () => {
  it("uses the documented content widths", () => {
    const { rerender } = render(<PageFrame size="narrow">Nội dung</PageFrame>);
    expect(screen.getByText("Nội dung")).toHaveClass("max-w-[800px]");
    rerender(<PageFrame size="wide">Nội dung rộng</PageFrame>);
    expect(screen.getByText("Nội dung rộng")).toHaveClass("max-w-[1320px]");
  });

  it("keeps disclosure state and action labels accessible", () => {
    render(
      <DisclosureSection title="Lịch sử" defaultOpen={false}>
        <p>Chi tiết</p>
      </DisclosureSection>,
    );
    const summary = screen.getByRole("button", { name: "Lịch sử" });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Chi tiết")).toBeVisible();
  });

  it("provides semantic directory and mobile record surfaces", () => {
    render(
      <>
        <DirectoryToolbar
          search={
            <label>
              Tìm
              <input aria-label="Tìm" />
            </label>
          }
        />
        <MobileRecordCard href="/products/1">Mặt hàng</MobileRecordCard>
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Tìm" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mặt hàng" })).toHaveAttribute("href", "/products/1");
  });
});
