import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./select.tsx";
import { useState } from "react";

describe("Select", () => {
  const options = [
    { value: "opt-1", label: "Option 1" },
    { value: "opt-2", label: "Option 2" },
  ];

  it("renders the selected value and calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="My Select" options={options} onChange={onChange} value="opt-1" />);

    // Initially closed, shows Option 1
    const trigger = screen.getByRole("combobox", { name: "My Select" });
    expect(trigger).toHaveTextContent("Option 1");

    await user.click(trigger);

    // Select Option 2
    await user.click(screen.getByRole("option", { name: "Option 2" }));

    expect(onChange).toHaveBeenCalledOnce();
    const eventArg = onChange.mock.calls[0]?.[0] as { target: { value: string } };
    expect(eventArg?.target?.value).toBe("opt-2");
  });

  it("handles controlled value correctly", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const [val, setVal] = useState("opt-1");
      return (
        <Select
          label="Controlled"
          options={options}
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
      );
    }

    render(<TestComponent />);

    const trigger = screen.getByRole("combobox", { name: "Controlled" });
    expect(trigger).toHaveTextContent("Option 1");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Option 2" }));

    expect(trigger).toHaveTextContent("Option 2");
  });

  it("respects the disabled state", async () => {
    const user = userEvent.setup();
    render(<Select label="Disabled" options={options} disabled />);

    const trigger = screen.getByRole("combobox", { name: "Disabled" });
    expect(trigger).toBeDisabled();

    await user.click(trigger);
    // Menu shouldn't open
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation and Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Keyboard" options={options} onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Keyboard" });
    await user.click(trigger); // open menu

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();

    // Select the first option with keyboard
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalled();
    const eventArg = onChange.mock.calls[0]?.[0] as { target: { value: string } };
    expect(eventArg?.target?.value).toBe("opt-1");

    // Close with escape
    await user.click(trigger); // open again
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // Wait for the listbox to be hidden from accessibility tree
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("integrates with native form submission via the hidden input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      return formData.get("myField");
    });

    render(
      <form onSubmit={onSubmit}>
        <Select
          name="myField"
          label="Form Field"
          options={options}
          value="opt-2"
          onChange={() => {}}
        />
        <button type="submit">Submit</button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.results[0]?.value).toBe("opt-2");
  });
});
