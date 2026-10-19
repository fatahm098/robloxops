import type { Metadata } from "next";
import Link from "next/link";
import { Home } from "lucide-react";

import { RevisionsTable } from "@/components/revisions/revisions-table";
import { listRevisions } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Revisions — RobloxOps",
};

export default async function RevisionsPage() {
  const revisions = await listRevisions();
  const open = revisions.filter((revision) => revision.status === "open").length;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">REVISIONS</span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">Revisions</h1>
          <p className="text-body-md text-ink-muted">
            Customer change requests logged against delivered and in-review commissions.
          </p>
        </div>

        <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
          <div className="tabular font-mono text-[15px] font-semibold leading-tight text-ink">
            {revisions.length}
          </div>
          <div className="meta text-[9px] leading-tight">REVISIONS · {open} OPEN</div>
        </div>
      </header>

      <RevisionsTable revisions={revisions} />
    </div>
  );
}
