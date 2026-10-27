import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Bot, Home, Pause, TriangleAlert } from "lucide-react";

import { AgentToggleButton } from "@/components/agents/agent-toggle-button";
import { PauseAllButton } from "@/components/agents/pause-all-button";
import { OrchestratorPlayground } from "@/components/agents/orchestrator-playground";
import { isDemoMode } from "@/lib/data";
import { getAgentPauseState, getAgentStatuses } from "@/lib/insights";
import type { AgentState } from "@/lib/types";
import { cn, formatUsd, relativeTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "AI Ops & Agents — RobloxOps",
};

const STATE_STYLES: Record<AgentState, { label: string; className: string; icon: typeof Activity }> = {
  active: {
    label: "Active",
    className: "border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] text-status-delivered",
    icon: Activity,
  },
  paused: {
    label: "Paused",
    className: "border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.15)] text-status-briefing",
    icon: Pause,
  },
  error: {
    label: "Error",
    className: "border-[rgba(251,113,133,0.3)] bg-[rgba(244,63,94,0.15)] text-status-review",
    icon: TriangleAlert,
  },
};

export default async function AgentsPage() {
  const [agents, pauseState] = await Promise.all([getAgentStatuses(), getAgentPauseState()]);
  const active = agents.filter((agent) => agent.state === "active").length;
  const totalCost = agents.reduce((sum, agent) => sum + agent.costUsd, 0);
  const actions = agents.reduce((sum, agent) => sum + agent.actions24h, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">AI OPS &amp; AGENTS</span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">AI Ops &amp; Agents</h1>
          <p className="text-body-md text-ink-muted">
            Deterministic workflow, selective AI calls. Every action is audited.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
            <div className="tabular font-mono text-[15px] font-semibold leading-tight text-status-delivered">
              {active}/{agents.length}
            </div>
            <div className="meta text-[9px] leading-tight">AGENTS ACTIVE</div>
          </div>
          <PauseAllButton paused={pauseState.aiPaused} disabled={isDemoMode} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="panel px-4 py-3">
          <span className="meta">Actions · 24h</span>
          <div className="tabular mt-1.5 text-[22px] font-semibold text-ink">{actions}</div>
        </div>
        <div className="panel px-4 py-3">
          <span className="meta">Spend · 24h</span>
          <div className="tabular mt-1.5 text-[22px] font-semibold text-brand">{formatUsd(totalCost)}</div>
        </div>
        <div className="panel px-4 py-3">
          <span className="meta">Escalations</span>
          <div className="tabular mt-1.5 text-[22px] font-semibold text-status-briefing">11</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {agents.map((agent) => {
          const state = STATE_STYLES[agent.state];
          return (
            <article key={agent.id} className="panel flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded border border-line-strong bg-surface-2">
                    <Bot className="h-4 w-4 text-brand" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-[14px] font-semibold text-ink">{agent.name}</h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">{agent.role}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex h-[22px] items-center gap-1.5 rounded border px-2 font-mono text-[10px] uppercase tracking-[0.06em]",
                    state.className,
                  )}
                >
                  <state.icon className="h-3 w-3" aria-hidden="true" />
                  {state.label}
                </span>
              </div>

              <p className="text-[12px] leading-relaxed text-ink-muted">{agent.description}</p>

              <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3">
                <div>
                  <dt className="meta text-[9px]">Model</dt>
                  <dd className="truncate font-mono text-[11px] text-ink">{agent.model}</dd>
                </div>
                <div>
                  <dt className="meta text-[9px]">Actions 24h</dt>
                  <dd className="tabular font-mono text-[11px] text-ink">{agent.actions24h}</dd>
                </div>
                <div>
                  <dt className="meta text-[9px]">Cost</dt>
                  <dd className="tabular font-mono text-[11px] text-brand">{formatUsd(agent.costUsd)}</dd>
                </div>
              </dl>

              <div className="flex items-center justify-between border-t border-line pt-2.5">
                <span className="font-mono text-[10px] text-ink-dim">last run {relativeTime(agent.lastRunAt)}</span>
                <AgentToggleButton
                  agentId={agent.id}
                  paused={agent.state === "paused"}
                  disabled={isDemoMode || pauseState.aiPaused}
                  disabledReason={
                    isDemoMode
                      ? "Connect Supabase to control agents"
                      : "Global AI pause is on — resume all agents first"
                  }
                />
              </div>
            </article>
          );
        })}
      </div>

      <OrchestratorPlayground />

      <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
        Pausing sets <span className="text-ink-muted">tenants.settings.ai_paused</span> — messages keep arriving and queue, but no agent replies.
      </p>
    </div>
  );
}
