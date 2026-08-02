import { EmptyState } from "@/ui/primitives/empty-state.tsx";

/** Reserved for a future Supabase PKCE exchange. */
export function AuthCallbackView() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <EmptyState
        title="Đăng nhập liên kết chưa được bật"
        description="Trang này được dành cho đăng nhập OAuth trong tương lai."
      />
    </main>
  );
}
