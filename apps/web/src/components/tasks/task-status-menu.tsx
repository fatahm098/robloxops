"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { updateTaskStatus } from "@/app/(dashboard)/tasks/actions";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

interface TaskStatusMenuProps {
  taskId: string;
  status: TaskStatus;
  disabled?: boolean;
}

export function TaskStatusMenu({ taskId, status, disabled = false }: TaskStatusMenuProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === status) return;
    startTransition(async () => {
      await updateTaskStatus(taskId, next);
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">Status</span>
      <select
        value={status}
        disabled={disabled || pending}
        onChange={(event) => onChange(event.target.value)}
        title={disabled ? "Connect Supabase to change status" : undefined}
        className={cn(
          "h-7 rounded border border-line bg-surface-3 px-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted focus:border-brand focus:outline-none",
          (disabled || pending) && "opacity-60",
        )}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
