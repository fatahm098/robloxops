import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export function AiActivityBar() {
  return (
    <section
      aria-label="Latest AI intake activity"
      className="panel flex items-center gap-3 px-4 py-3"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded border border-brand/30 bg-brand/10 text-brand">
        <Sparkles size={16} aria-hidden="true" />
      </span>

      <p className="min-w-0 flex-1 truncate text-body-md text-ink-muted">
        <span className="font-medium text-ink">AI Intake Agent &ldquo;Lexi&rdquo;</span> parsed 4 new
        commission requests from Discord{" "}
        <span className="font-mono text-label-md text-brand">#commissions</span>
        <span className="mx-1.5 text-ink-dim" aria-hidden="true">
          ·
        </span>
        <span className="font-mono text-[11px] text-ink-muted">12m ago</span>
        <span className="mx-1.5 text-ink-dim" aria-hidden="true">
          ·
        </span>
        0 human escalations
      </p>

      <Link
        href="/audit"
        className="group inline-flex shrink-0 items-center gap-1.5 font-mono text-label-sm uppercase tracking-[0.06em] text-brand transition-colors hover:text-brand-bright"
      >
        View Audit Log
        <ArrowRight
          size={13}
          className="transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}
