import { EmptyState } from "../../../ui/primitives/empty-state.tsx";

/** Reserved for a future Supabase PKCE exchange. No OAuth provider is enabled yet. */
export default function AuthCallbackPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <EmptyState
        title="Đăng nhập liên kết chưa được bật"
        description="Trang này được dành cho đăng nhập OAuth trong tương lai."
      />
    </main>
  );
}
