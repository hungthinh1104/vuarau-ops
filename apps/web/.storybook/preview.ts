import type { Preview } from "@storybook/react-vite";
import "../src/app/globals.css";

/**
 * Storybook is the executable UI state catalog (design.md), so the viewports it
 * opens in are the ones the product is actually used on: a phone at a loading bay
 * first, a desk second.
 */
const preview: Preview = {
  parameters: {
    layout: "padded",
    viewport: {
      options: {
        mobile: { name: "Điện thoại (390px)", styles: { width: "390px", height: "844px" } },
        tablet: { name: "Máy tính bảng (768px)", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Máy bàn (1280px)", styles: { width: "1280px", height: "800px" } },
      },
    },
  },
  initialGlobals: { viewport: { value: "mobile" } },
};

export default preview;
