"use client";

import { useRef } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, Palette, Search, SlidersHorizontal } from "lucide-react";

import { statusMeta } from "@/lib/status";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusCounts = Record<ProjectStatus | "all", number>;

const STATUS_PILLS: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "intake", label: statusMeta.intake.label },
  { value: "briefing", label: statusMeta.briefing.label },
  { value: "in_design", label: statusMeta.in_design.label },
  { value: "qa_check", label: statusMeta.qa_check.label },
  { value: "customer_review", label: statusMeta.customer_review.label },
  { value: "delivered", label: statusMeta.delivered.label },
  { value: "cancelled", label: statusMeta.cancelled.label },
];

const SELECT_STATUSES: (ProjectStatus | "all")[] = [
  "all",
  "intake",
  "briefing",
  "brief_review",
  "in_design",
  "qa_check",
  "customer_review",
  "revision",
  "approved",
  "delivered",
  "on_hold",
  "cancelled",
];

const TEAM_OPTIONS = ["Elena R.", "Marcus T.", "Devon K."];

function hrefFor(status: ProjectStatus | "all", q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

interface ProjectFiltersProps {
  counts: StatusCounts;
  activeStatus: ProjectStatus | "all";
  q?: string;
}

export function ProjectFilters({ counts, activeStatus, q }: ProjectFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <form
        ref={formRef}
        action="/projects"
        method="get"
        className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-12"
      >
        <div className="relative xl:col-span-4">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
          <input
            key={`q-${q ?? ""}`}
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search ref #, Discord handle, ticket name…"
            aria-label="Search projects"
            className="h-11 w-full rounded border border-line bg-surface-1 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none"
          />
          <button type="submit" className="sr-only">
            Search
          </button>
        </div>

        <div className="relative xl:col-span-3">
          <SlidersHorizontal
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
          <select
            key={`status-${activeStatus}`}
            name="status"
            defaultValue={activeStatus}
            aria-label="Filter by pipeline stage"
            onChange={() => formRef.current?.requestSubmit()}
            className="h-11 w-full cursor-pointer appearance-none rounded border border-line bg-surface-1 pl-9 pr-8 text-[13px] text-ink-muted focus:border-brand focus:outline-none"
          >
            {SELECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "Status: All Lifecycle Stages" : `Status: ${statusMeta[value].label}`}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
        </div>

        <div className="relative xl:col-span-3">
          <Palette
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
          <select
            defaultValue="all"
            aria-label="Filter by assigned lead"
            className="h-11 w-full cursor-pointer appearance-none rounded border border-line bg-surface-1 pl-9 pr-8 text-[13px] text-ink-muted focus:border-brand focus:outline-none"
          >
            <option value="all">All Studio Modelers &amp; Riggers</option>
            {TEAM_OPTIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
        </div>

        <div className="xl:col-span-2">
          <button
            type="button"
            className="flex h-11 w-full items-center justify-between gap-2 rounded border border-line bg-surface-1 px-3 text-[13px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-ink-dim" aria-hidden="true" />
              Oct 2024
            </span>
            <ChevronDown className="h-4 w-4 text-ink-dim" aria-hidden="true" />
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_PILLS.map((pill) => {
          const active = pill.value === activeStatus;
          return (
            <Link
              key={pill.value}
              href={hrefFor(pill.value, q)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-mono text-[11px] tracking-wide transition-colors",
                active
                  ? "bg-brand font-semibold text-canvas"
                  : "border border-line bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
              )}
            >
              {pill.label}
              <span
                className={cn(
                  "tabular rounded-full px-1.5 py-0.5 text-[10px]",
                  active ? "bg-canvas/20 text-canvas" : "bg-canvas text-ink-dim",
                )}
              >
                {counts[pill.value]}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
