import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoginView } from "./login-view.tsx";

const signIn = async () => ({ ok: true as const });

const meta = {
  title: "Screens/Auth/Login",
  component: LoginView,
  args: { status: "signed_out", signIn },
} satisfies Meta<typeof LoginView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};
export const LoadingSession: Story = { args: { status: "checking" } };
export const Unconfigured: Story = { args: { status: "unconfigured" } };
