"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play } from "lucide-react";

import { setAgentPaused } from "@/app/(dashboard)/agents/actions";

interface AgentToggleButtonProps {
  agentId: string;
  paused: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function AgentToggleButton({
  agentId,
  paused,
  disabled = false,
  disabledReason,
}: AgentToggleButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      await setAgentPaused(agentId, !paused);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || pending}
      title={disabled ? disabledReason : undefined}
      className="inline-flex h-8 items-center gap-1.5 rounded border border-line-strong px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : paused ? (
        <>
          <Play className="h-3 w-3" aria-hidden="true" /> Resume
        </>
      ) : (
        <>
          <Pause className="h-3 w-3" aria-hidden="true" /> Pause
        </>
      )}
    </button>
  );
}
