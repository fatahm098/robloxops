import { getTenant } from "@/lib/data";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <Topbar tenant={tenant} />
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
