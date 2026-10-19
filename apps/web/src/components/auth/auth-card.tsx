import type { ReactNode } from "react";
import Link from "next/link";
import { Box } from "lucide-react";

export function AuthCard({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2.5"
          aria-label="Back to RobloxOps"
        >
          <span className="grid h-8 w-8 place-items-center rounded bg-brand text-canvas">
            <Box size={17} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">RobloxOps</span>
        </Link>

        <div className="panel p-5">
          <p className="meta text-[10px]">{eyebrow}</p>
          <h1 className="mt-1.5 text-headline-lg leading-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>

        <div className="mt-4 text-center text-[12px] text-ink-dim">{footer}</div>
      </div>
    </div>
  );
}
