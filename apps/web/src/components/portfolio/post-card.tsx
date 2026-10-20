"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, Share2, Trash2 } from "lucide-react";

import {
  publishPortfolioPost,
  rejectPortfolioPost,
  savePortfolioCaption,
} from "@/app/(dashboard)/portfolio/actions";
import type { PortfolioPost } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

const MAX_CAPTION = 240;

export function PostCard({ post }: { post: PortfolioPost }) {
  const [caption, setCaption] = useState(post.caption);
  const [message, setMessage] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState<string | null>(post.externalUrl);
  const [savePending, startSave] = useTransition();
  const [publishPending, startPublish] = useTransition();
  const [rejectPending, startReject] = useTransition();

  const published = post.status === "published";
  const dirty = caption.trim() !== post.caption;
  const busy = savePending || publishPending || rejectPending;

  function save() {
    setMessage(null);
    startSave(async () => {
      const result = await savePortfolioCaption(post.id, caption);
      setMessage(result.message);
    });
  }

  function publish() {
    setMessage(null);
    startPublish(async () => {
      const result = await publishPortfolioPost(post.id);
      setMessage(result.message);
      if (result.externalUrl) setExternalUrl(result.externalUrl);
    });
  }

  function reject() {
    setMessage(null);
    startReject(async () => {
      const result = await rejectPortfolioPost(post.id, "Ditolak dari review queue");
      setMessage(result.message);
    });
  }

  return (
    <article className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Share2 size={14} className="text-ink-muted" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink">
            {post.projectReference ?? "Portofolio"}
          </span>
          {post.projectTitle ? (
            <span className="truncate text-[12px] text-ink-muted">· {post.projectTitle}</span>
          ) : null}
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]",
            published
              ? "bg-[rgba(34,197,94,0.15)] text-status-delivered"
              : post.status === "failed"
                ? "bg-[rgba(244,63,94,0.15)] text-status-review"
                : "bg-surface-2 text-ink-muted",
          )}
        >
          {published ? "Tayang" : post.status === "failed" ? "Gagal" : "Menunggu review"}
        </span>
      </header>

      <div className="grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
          {post.mediaUrls.length > 0 ? (
            post.mediaUrls.slice(0, 2).map((media) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={media.path || media.url}
                src={media.url}
                alt=""
                className="h-20 w-full rounded border border-line object-cover sm:h-24"
              />
            ))
          ) : (
            <div className="grid h-20 place-items-center rounded border border-dashed border-line-strong text-[11px] text-ink-dim sm:h-24">
              Tanpa gambar
            </div>
          )}
        </div>

        <div className="min-w-0">
          <label htmlFor={`caption-${post.id}`} className="meta mb-1 block text-[9px]">
            Caption
          </label>
          <textarea
            id={`caption-${post.id}`}
            value={caption}
            onChange={(event) => setCaption(event.target.value.slice(0, MAX_CAPTION))}
            rows={4}
            disabled={published || busy}
            className="w-full resize-y rounded border border-line-strong bg-surface-1 px-3 py-2 text-body-md text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-[10px] tabular text-ink-dim">
              {caption.length}/{MAX_CAPTION}
            </span>
            {post.error && !published ? (
              <span className="max-w-[60%] truncate font-mono text-[10px] text-status-review" title={post.error}>
                {post.error}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {published ? (
              externalUrl ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-line-strong px-3 text-[12px] text-ink-muted transition-colors hover:border-brand hover:text-brand"
                >
                  Lihat di X
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={publish}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-brand bg-brand px-3 text-[12px] font-semibold text-[#020617] transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {publishPending ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Check size={12} aria-hidden="true" />
                  )}
                  Publish
                </button>
                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={save}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-line-strong px-3 text-[12px] text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Simpan caption
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={reject}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-line-strong px-3 text-[12px] text-ink-dim transition-colors hover:border-status-review hover:text-status-review disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {rejectPending ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={12} aria-hidden="true" />
                  )}
                  Tolak
                </button>
              </>
            )}
          </div>

          {message ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
