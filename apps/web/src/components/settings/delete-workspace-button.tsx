"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

import { deleteWorkspaceData } from "@/app/(dashboard)/settings/actions";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

interface DeleteWorkspaceButtonProps {
  demoMode: boolean;
}

export function DeleteWorkspaceButton({ demoMode }: DeleteWorkspaceButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);

  async function onDelete() {
    if (confirmation !== "DELETE") {
      setMessage("Type DELETE exactly to confirm.");
      setMessageOk(false);
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const result = await deleteWorkspaceData(confirmation);
      setMessage(result.message);
      setMessageOk(result.ok);
      if (result.ok) {
        setOpen(false);
        setConfirmation("");
        router.refresh();
      }
    } catch {
      setMessage("Could not delete workspace data. Try again.");
      setMessageOk(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        disabled={demoMode}
        title={demoMode ? "Disabled in demo mode" : undefined}
        className="mt-3 inline-flex h-11 items-center gap-2 rounded border border-danger bg-[rgba(162,26,36,0.2)] px-4 text-[13px] font-medium text-danger-soft transition-colors hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        Delete workspace data
      </button>

      {message && !open ? (
        <p
          className={cn(
            "mt-2 font-mono text-[10px] uppercase tracking-[0.06em]",
            messageOk ? "text-status-delivered" : "text-danger-bright",
          )}
        >
          {message}
        </p>
      ) : null}

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Delete workspace data"
        description="This permanently deletes projects, customers, conversations, tasks, revisions, reports and stored deliverables. The workspace, team members and billing records are kept."
      >
        <div className="space-y-3">
          <label className="block">
            <span className="meta">
              Type <span className="font-mono text-danger-bright">DELETE</span> to confirm
            </span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-3 font-mono text-[13px] text-ink focus:border-danger focus:outline-none"
            />
          </label>

          {message ? (
            <p role="status" className="font-mono text-[10px] uppercase tracking-[0.06em] text-danger-bright">
              {message}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-[13px] text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={pending || confirmation !== "DELETE"}
              className="inline-flex h-11 items-center gap-2 rounded border border-danger bg-[rgba(162,26,36,0.2)] px-4 text-[13px] font-medium text-danger-soft transition-colors hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Delete permanently
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
