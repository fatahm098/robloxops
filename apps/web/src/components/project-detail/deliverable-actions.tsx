"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Box, Loader2, Send } from "lucide-react";

import {
  sendDeliverableToCustomer,
  updateProjectStatus,
} from "@/app/(dashboard)/projects/actions";

interface DeliverableActionsProps {
  projectId: string;
  deliverableId?: string;
  disabled?: boolean;
}

export function DeliverableActions({
  projectId,
  deliverableId,
  disabled = false,
}: DeliverableActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);

  async function sendToCustomer() {
    setBusy(true);
    setMessage(null);

    const statusResult = await updateProjectStatus(projectId, "customer_review");
    if (!statusResult.ok) {
      setMessageOk(false);
      setMessage(statusResult.message);
      setBusy(false);
      return;
    }

    const sendResult = await sendDeliverableToCustomer(projectId, deliverableId);
    setMessageOk(sendResult.ok);
    setMessage(sendResult.message);
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled
        title="3D viewer not implemented yet"
        className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded border border-line-strong bg-transparent px-4 text-body-md font-semibold text-ink opacity-60"
      >
        <Box className="h-4 w-4" aria-hidden="true" />
        Open in 3D Viewer
      </button>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={sendToCustomer}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-brand bg-brand px-4 text-body-md font-semibold text-[#020617] transition-colors hover:bg-brand-bright hover:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="h-4 w-4" aria-hidden="true" />
        )}
        Send to Customer for Approval
      </button>
      {message ? (
        <p
          className={
            messageOk
              ? "font-mono text-[10px] uppercase tracking-[0.06em] text-status-delivered"
              : "font-mono text-[10px] uppercase tracking-[0.06em] text-danger-soft"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
