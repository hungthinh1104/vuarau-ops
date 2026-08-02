import { Skeleton } from "@/ui/primitives/skeleton.tsx";

export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Đang tải trang"
      className="mx-auto flex min-h-[50vh] max-w-4xl flex-col gap-6 px-4 py-8 lg:px-6"
    >
      <div className="flex flex-col gap-2">
        <Skeleton width="w-32" height="h-4" label="Đang tải tiêu đề" />
        <Skeleton width="w-72" height="h-8" label="Đang tải nội dung" />
      </div>
      <section className="grid gap-4 sm:grid-cols-2">
        <Skeleton width="w-full" height="h-28" label="Đang tải thẻ thông tin" />
        <Skeleton width="w-full" height="h-28" label="Đang tải thẻ thông tin" />
      </section>
      <Skeleton width="w-full" height="h-56" label="Đang tải bảng dữ liệu" />
    </main>
  );
}
