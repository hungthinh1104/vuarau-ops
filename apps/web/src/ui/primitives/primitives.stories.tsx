import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./button.tsx";
import { IconButton } from "./icon-button.tsx";
import { TextInput } from "./text-input.tsx";
import { SearchInput } from "./search-input.tsx";
import { MoneyInput } from "./money-input.tsx";
import { QuantityInput } from "./quantity-input.tsx";
import { Select } from "./select.tsx";
import { Textarea } from "./textarea.tsx";
import { Dialog } from "./dialog.tsx";
import { Sheet } from "./sheet.tsx";
import { Badge } from "./badge.tsx";
import { Skeleton } from "./skeleton.tsx";
import { EmptyState } from "./empty-state.tsx";
import { ErrorSummary } from "./error-summary.tsx";
import { parseMoneyText } from "./numeric-text.ts";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";

const meta = { title: "Primitives" } satisfies Meta;
export default meta;
type Story = StoryObj;

export const Buttons: Story = {
  name: "Button — nhãn nói rõ lệnh gì",
  render: () => (
    <div className="flex flex-wrap gap-3">
      {/* Labels name the command. design.md forbids `Lưu` and `OK` for anything
          consequential: a worker must know what they agreed to. */}
      <Button>Chốt đơn</Button>
      <Button tone="secondary">Để sau</Button>
      <Button tone="danger">Hoàn tác thanh toán</Button>
      <Button tone="danger-solid">Xác nhận hoàn tác</Button>
      <Button disabledReason="Đơn đã chốt nên không sửa được nữa.">Sửa đơn</Button>
    </div>
  ),
};

export const IconButtons: Story = {
  name: "IconButton — luôn có tên đọc được",
  render: () => (
    <div className="flex gap-3">
      <IconButton label="Đóng">
        <X size={16} />
      </IconButton>
      <IconButton label="Xoá tìm kiếm">⌫</IconButton>
    </div>
  ),
};

export const TextInputs: Story = {
  name: "TextInput — giữ nguyên dữ liệu khi báo lỗi",
  parameters: coversState("validation_error"),
  render: function Render() {
    const [value, setValue] = useState("Chị Lan chợ Bình Điề");
    return (
      <div className="flex max-w-md flex-col gap-4">
        <TextInput
          label="Tên khách hàng"
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          hint="Ghi cả tên và chợ để sau này tìm lại được."
        />
        <TextInput
          label="Số điện thoại"
          value="09031122"
          onChange={() => undefined}
          error="Số điện thoại phải có 10 chữ số."
        />
      </div>
    );
  },
};

export const Search: Story = {
  name: "SearchInput — gõ không dấu vẫn ra",
  render: function Render() {
    const [query, setQuery] = useState("co hoa");
    return (
      <div className="max-w-md">
        <SearchInput
          label="Tìm khách hàng"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="Tên hoặc số điện thoại"
        />
        <p className="mt-2 text-caption text-ink-muted">
          Bỏ dấu được xử lý ở máy chủ, nên “co hoa” tìm ra “Cô Hoà”.
        </p>
      </div>
    );
  },
};

export const NumericInputs: Story = {
  name: "MoneyInput / QuantityInput — số nguyên hoặc từ chối",
  render: function Render() {
    const [amount, setAmount] = useState("875.000");
    const [quantity, setQuantity] = useState("12,5");
    const parsed = parseMoneyText(amount, "VND");

    return (
      <div className="flex max-w-md flex-col gap-4">
        <MoneyInput
          label="Số tiền"
          currency="VND"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          {...(parsed.ok ? {} : { error: parsed.reason })}
        />
        <QuantityInput
          label="Số lượng"
          unit="kg"
          required
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <p className="text-caption text-ink-muted">
          Thử gõ “875.000,5”: bị từ chối chứ không tự làm tròn — làm tròn là luật nghiệp vụ và nằm ở
          máy chủ.
        </p>
      </div>
    );
  },
};

export const Selects: Story = {
  name: "Select — không tự chọn sẵn lý do",
  render: () => (
    <div className="max-w-md">
      <Select
        label="Lý do hoàn tác"
        required
        // No pre-selected option: "the first reason code in the list" is not a
        // reason anybody gave.
        placeholder="Chọn lý do"
        options={[
          { value: "wrong_amount", label: "Sai số tiền" },
          { value: "wrong_customer", label: "Sai khách hàng" },
          { value: "goods_returned", label: "Khách trả hàng" },
          { value: "duplicate_entry", label: "Ghi trùng" },
          { value: "other", label: "Lý do khác" },
        ]}
      />
    </div>
  ),
};

export const Textareas: Story = {
  name: "Textarea — chỗ để giải thích",
  render: () => (
    <div className="max-w-md">
      <Textarea
        label="Giải thích"
        required
        hint="Người tra lại sổ sau này sẽ đọc đúng dòng này."
        defaultValue="Ghi nhầm 2 thùng ớt, thực tế chỉ giao 1 thùng."
      />
    </div>
  ),
};

export const Dialogs: Story = {
  name: "Dialog — xác nhận ngắn",
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Mở hộp thoại</Button>
        <Dialog
          open={open}
          title="Bỏ đơn nháp?"
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button tone="secondary" onClick={() => setOpen(false)}>
                Giữ lại
              </Button>
              <Button tone="danger" onClick={() => setOpen(false)}>
                Bỏ đơn
              </Button>
            </>
          }
        >
          <p className="text-body-sm">
            Đơn nháp sẽ được đánh dấu là đã bỏ và vẫn nằm trong sổ. Không phát sinh công nợ.
          </p>
        </Dialog>
      </>
    );
  },
};

export const Sheets: Story = {
  name: "Sheet — chọn nhanh trên điện thoại",
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button tone="secondary" onClick={() => setOpen(true)}>
          Chọn khách hàng
        </Button>
        <Sheet open={open} title="Chọn khách hàng" onClose={() => setOpen(false)}>
          <ul className="flex flex-col gap-2 text-body">
            <li>Chị Lan — chợ Bình Điền</li>
            <li>Anh Tuấn — vựa Thủ Đức</li>
            <li>Cô Hoà — quán cơm Tân Bình</li>
          </ul>
        </Sheet>
      </>
    );
  },
};

export const Badges: Story = {
  name: "Badge — màu không bao giờ đứng một mình",
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge tone="positive">Đã chốt</Badge>
      <Badge tone="neutral">Nháp</Badge>
      <Badge tone="warning">Quá hạn</Badge>
      <Badge tone="danger">Đã hoàn tác</Badge>
      <Badge tone="info">Đơn thay thế</Badge>
      <Badge tone="offline">Chờ đồng bộ</Badge>
    </div>
  ),
};

export const Skeletons: Story = {
  name: "Skeleton — chỗ của số tiền chưa về",
  render: () => (
    <div className="flex flex-col gap-3">
      <Skeleton width="w-40" height="h-8" label="Đang tải công nợ" />
      <Skeleton width="w-64" />
      <Skeleton width="w-32" />
    </div>
  ),
};

export const Empties: Story = {
  name: "EmptyState — nói rõ là chưa có gì",
  render: () => (
    <EmptyState
      title="Khách này chưa có giao dịch nào"
      description="Công nợ đúng bằng 0 ₫. Đây là sự thật, không phải lỗi tải dữ liệu."
    />
  ),
};

export const ErrorSummaries: Story = {
  name: "ErrorSummary — gom lỗi lên đầu biểu mẫu",
  render: () => (
    <ErrorSummary
      issues={[
        { fieldId: "quantity", message: "Số lượng phải lớn hơn 0 kg." },
        { fieldId: "unitPrice", message: "Đơn giá không được để trống." },
      ]}
    />
  ),
};
