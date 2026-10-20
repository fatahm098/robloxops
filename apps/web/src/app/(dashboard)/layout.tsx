import { getStatusCounts, getTenant, listTasks } from "@/lib/data";
import { getUnreadCount } from "@/lib/notifications";
import { RealtimeRefresh } from "@/lib/realtime";
import { ViewModeProvider } from "@/lib/view-mode";
import { DesignerGuard } from "@/components/shell/designer-guard";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

const REALTIME_TABLES = ["projects", "tasks", "outbound_messages", "notifications"];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [tenant, counts, tasks, unreadCount] = await Promise.all([
    getTenant(),
    getStatusCounts(),
    listTasks(),
    getUnreadCount(),
  ]);

  const projectCount = counts.all;
  const taskCount = tasks.filter((task) => task.status !== "done").length;

  return (
    <ViewModeProvider>
      <DesignerGuard />
      <div className="grid min-h-screen grid-cols-[240px_1fr] bg-canvas">
        <Sidebar projectCount={projectCount} taskCount={taskCount} />
        <div className="flex min-w-0 flex-col">
          <Topbar tenant={tenant} unreadCount={unreadCount} />
          <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
        </div>
        <RealtimeRefresh tables={REALTIME_TABLES} />
      </div>
    </ViewModeProvider>
  );
}
