import { getStatusCounts, getTenant, listTasks } from "@/lib/data";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [tenant, counts, tasks] = await Promise.all([getTenant(), getStatusCounts(), listTasks()]);

  const projectCount = counts.all;
  const taskCount = tasks.filter((task) => task.status !== "done").length;

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-canvas">
      <Sidebar projectCount={projectCount} taskCount={taskCount} />
      <div className="flex min-w-0 flex-col">
        <Topbar tenant={tenant} />
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
