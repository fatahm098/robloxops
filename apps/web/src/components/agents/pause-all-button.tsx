"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play } from "lucide-react";

import { setAgentsPaused } from "@/app/(dashboard)/agents/actions";
import { cn } from "@/lib/utils";

interface PauseAllButtonProps {
  paused: boolean;
  disabled?: boolean;
}

export function PauseAllButton({ paused, disabled = false }: PauseAllButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      await setAgentsPaused(!paused);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || pending}
      title={disabled ? "Connect Supabase to control agents" : undefined}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded border px-4 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        paused
          ? "border-line-strong text-ink hover:border-brand hover:text-brand"
          : "border-danger bg-[rgba(162,26,36,0.2)] text-danger-soft hover:bg-danger hover:text-white",
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : paused ? (
        <Play className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Pause className="h-4 w-4" aria-hidden="true" />
      )}
      {paused ? "Resume all agents" : "Pause all agents"}
    </button>
  );
}
