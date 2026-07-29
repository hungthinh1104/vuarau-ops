import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignIn, SignInUnconfigured } from "./sign-in.tsx";
import { WorkspacePicker } from "../../api/session-gate.tsx";
import { coversState } from "../catalog-state.ts";
import { workspaceChoices } from "../../fixtures/session.fixtures.ts";

const meta = {
  title: "Patterns/SignIn",
  component: SignIn,
} satisfies Meta<typeof SignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nobody is signed in. Credentials were provisioned by an operator. */
export const SignedOut: Story = {
  name: "signed_out — chưa đăng nhập",
  parameters: coversState("signed_out"),
  args: {
    signIn: async () => ({ ok: true }),
  },
};

/**
 * The code was wrong or has expired. The message says what to do next — press
 * send again — rather than reporting that something failed.
 */
export const CredentialsRejected: Story = {
  name: "signed_out — thông tin đăng nhập không đúng",
  args: {
    signIn: async () => ({
      ok: false,
      message: "Email hoặc mật khẩu không đúng.",
    }),
  },
};

/**
 * An email nobody provisioned. Sign-up is off on purpose: a typo would otherwise
 * create an account that can sign in and see nothing at all.
 */
export const NetworkUnavailable: Story = {
  name: "signed_out — không kết nối được dịch vụ đăng nhập",
  args: {
    signIn: async () => ({
      ok: false,
      message: "Không kết nối được dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.",
    }),
  },
};

/** A deployment with no Supabase project. Not the worker's problem, and it says so. */
export const Unconfigured: StoryObj = {
  name: "signed_out — chưa cấu hình Supabase",
  render: () => <SignInUnconfigured />,
};

/**
 * Signed in, and a member of no depot — a successful answer from
 * `session.workspaces`, not a failure (BR-AUTH-008). Rendered as a spinner it
 * would look like a list that never arrives; rendered like this it names who to
 * ask.
 */
export const NoMembership: StoryObj = {
  name: "no_workspace_membership — chưa thuộc vựa nào",
  parameters: coversState("no_workspace_membership"),
  render: () => (
    <WorkspacePicker choices={[]} onChoose={() => undefined} onSignOut={() => undefined} />
  ),
};

/**
 * Two depots, and the choice is always made by a person. There is no "if there is
 * only one, use it" — the convenient case is exactly the case where somebody with
 * two would not notice which set of books they were writing into.
 */
export const ChooseWorkspace: StoryObj = {
  name: "chọn vựa — luôn hỏi, kể cả khi chỉ có một",
  render: () => <WorkspacePicker choices={workspaceChoices} onChoose={() => undefined} />,
};
