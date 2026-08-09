import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  Toaster: (props: {
    readonly toastOptions?: {
      readonly className?: string;
      readonly classNames?: Readonly<Record<string, string>>;
    };
  }) => (
    <output
      data-testid="sonner-config"
      data-toast-class={props.toastOptions?.className}
      data-action-class={props.toastOptions?.classNames?.["actionButton"]}
    />
  ),
}));

import { Toaster } from "./toaster.tsx";

describe("Toaster", () => {
  it("does not block the page while keeping toast actions interactive", () => {
    render(<Toaster />);
    const config = screen.getByTestId("sonner-config");

    expect(config.dataset["toastClass"]).toContain("pointer-events-none");
    expect(config.dataset["toastClass"]).not.toContain("pointer-events-auto");
    expect(config.dataset["actionClass"]).toContain("pointer-events-auto");
  });
});
