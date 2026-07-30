import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CustomerFields } from "./customer-fields.tsx";

function ControlledCustomerFields() {
  const [displayName, setDisplayName] = useState("Cô Hoa");
  const [phone, setPhone] = useState("0901234567");
  const [note, setNote] = useState("Giao buổi sáng");

  return (
    <CustomerFields
      displayName={displayName}
      phone={phone}
      note={note}
      onDisplayName={setDisplayName}
      onPhone={setPhone}
      onNote={setNote}
    />
  );
}

describe("CustomerFields", () => {
  it("keeps all customer data controlled while one field changes", async () => {
    const user = userEvent.setup();
    render(<ControlledCustomerFields />);

    const name = screen.getByLabelText("Tên khách hàng");
    await user.clear(name);
    await user.type(name, "Cô Hoa mới");

    expect(name).toHaveValue("Cô Hoa mới");
    expect(screen.getByLabelText("Số điện thoại")).toHaveValue("0901234567");
    expect(screen.getByLabelText("Ghi chú")).toHaveValue("Giao buổi sáng");
  });
});
