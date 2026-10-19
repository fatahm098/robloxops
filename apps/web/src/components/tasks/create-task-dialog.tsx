"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, TriangleAlert } from "lucide-react";

import { createTask } from "@/app/(dashboard)/tasks/actions";
import { Modal } from "@/components/ui/modal";

export interface ProjectOption {
  id: string;
  reference: string;
  title: string;
}

interface CreateTaskDialogProps {
  projects: ProjectOption[];
  disabled?: boolean;
}

const inputClass =
  "mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-2.5 text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none disabled:opacity-60";

export function CreateTaskDialog({ projects, disabled = false }: CreateTaskDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("0");
  const [dueAt, setDueAt] = useState("");

  function reset() {
    setTitle("");
    setPriority("0");
    setDueAt("");
    setError(null);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await createTask({
      projectId,
      title,
      priority: priority.trim() ? Number(priority) : 0,
      dueAt: dueAt || undefined,
    });
    setBusy(false);

    if (result.ok) {
      reset();
      setOpen(false);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || projects.length === 0}
        title={
          disabled
            ? "Connect Supabase to create tasks"
            : projects.length === 0
              ? "Create a project first"
              : undefined
        }
        className="inline-flex h-11 items-center gap-1.5 rounded border border-brand bg-brand px-3.5 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand-bright hover:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
        New Task
      </button>

      <Modal
        open={open}
        onClose={close}
        title="New Task"
        description="Queue a designer work item against an active project."
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="meta">Task title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Finalise katana scabbard weld"
              autoFocus
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="meta">Project</span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className={inputClass}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.reference} · {project.title}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="meta">Priority (0-100)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="meta">Due date</span>
              <input
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {error ? (
            <p className="flex items-start gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-danger-soft">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:border-brand disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
