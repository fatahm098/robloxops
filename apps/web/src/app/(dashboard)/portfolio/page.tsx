import type { Metadata } from "next";
import Link from "next/link";
import { Share2 } from "lucide-react";

import { PostCard } from "@/components/portfolio/post-card";
import { listPortfolioPosts } from "@/lib/portfolio";

export const metadata: Metadata = { title: "Portofolio — RobloxOps" };

export default async function PortfolioPage() {
  const posts = await listPortfolioPosts();
  const pending = posts.filter((post) => post.status === "queued" || post.status === "failed");
  const published = posts.filter((post) => post.status === "published");

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 py-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="meta text-[10px]">PORTFOLIO</p>
          <h1 className="mt-1 text-headline-xl leading-tight text-ink">Portofolio studio</h1>
          <p className="mt-1 text-body-md text-ink-muted">
            Setiap proyek yang selesai dibuatkan draf caption. Kamu yang memutuskan kapan tayang.
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex h-8 items-center gap-1.5 rounded border border-line-strong px-3 text-[12px] text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          Hubungkan akun X
        </Link>
      </header>

      {posts.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand/15 text-brand">
            <Share2 size={18} aria-hidden="true" />
          </span>
          <p className="text-[13px] font-medium text-ink">Belum ada portofolio</p>
          <p className="max-w-[420px] text-[12px] text-ink-muted">
            Tandai proyek sebagai <span className="text-ink">delivered</span> atau{" "}
            <span className="text-ink">approved</span> di halaman proyek, dan draf portofolio akan
            muncul di sini.
          </p>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-headline-sm text-ink">Menunggu review</h2>
          {pending.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </section>
      ) : null}

      {published.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-headline-sm text-ink">Sudah tayang</h2>
          {published.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
