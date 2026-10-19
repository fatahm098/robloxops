"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import { FileUp, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { finalizeUpload, prepareUpload } from "@/app/(dashboard)/deliverables/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface UploadProjectOption {
  id: string;
  reference: string;
  title: string;
}

interface UploadPanelProps {
  projects: UploadProjectOption[];
  disabled?: boolean;
}

export function UploadPanel({ projects, disabled = false }: UploadPanelProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = !disabled && !busy && Boolean(file) && Boolean(projectId);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleUpload() {
    if (!file || !projectId) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const extension = file.name.includes(".")
        ? file.name.split(".").pop()!.toLowerCase()
        : "";

      const prepared = await prepareUpload({
        projectId,
        filename: file.name,
        sizeBytes: file.size,
        fileType: extension ? extension.toUpperCase() : undefined,
      });

      if (!prepared.ok || !prepared.path || !prepared.token || !prepared.deliverableId) {
        setError(prepared.message);
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("deliverables")
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        return;
      }

      const finalized = await finalizeUpload(prepared.deliverableId);
      if (!finalized.ok) {
        setError(finalized.message);
        return;
      }

      setSuccess(`v${prepared.version} uploaded — queued for automated QA.`);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="upload-panel" className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-headline-sm text-ink">Upload Deliverable</h2>
        <span className="meta text-[9px]">R15 · UGC</span>
      </div>

      <label
        className={cn(
          "mt-3 block rounded border border-dashed border-line-strong bg-canvas px-4 py-8 text-center transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-brand",
        )}
      >
        <input
          type="file"
          className="sr-only"
          disabled={disabled}
          onChange={onFileChange}
          accept=".rbxm,.rbxmx,.rbx,.fbx,.obj,.blend,.png,.jpg,.jpeg,.webp,.tga"
        />
        <FileUp className="mx-auto h-6 w-6 text-ink-dim" aria-hidden="true" />
        <p className="mt-2 text-[13px] text-ink">{file ? file.name : "Drop .rbxm, .png or .fbx here"}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
          Max 50 MB · MIME validated
        </p>
        <span className="mt-3 inline-flex h-9 items-center rounded border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
          Browse files
        </span>
      </label>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="meta">Attach to project</span>
          <select
            value={projectId}
            disabled={disabled || projects.length === 0}
            onChange={(event) => setProjectId(event.target.value)}
            className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-2 text-[13px] text-ink focus:border-brand focus:outline-none disabled:opacity-60"
          >
            {projects.length === 0 ? (
              <option value="">No open projects</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.reference} · {project.title}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="flex items-start gap-2.5 rounded border border-line bg-surface-1 px-3 py-2.5">
          <input
            type="checkbox"
            defaultChecked
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded-sm border border-line-strong bg-canvas accent-brand"
          />
          <span>
            <span className="block text-[12px] text-ink">Run automated QA after upload</span>
            <span className="block font-mono text-[10px] text-ink-dim">
              Mesh bounds · texture budget · R15 rig
            </span>
          </span>
        </label>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleUpload}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2 rounded text-[13px] font-semibold transition-colors",
            canSubmit
              ? "bg-brand text-canvas hover:bg-brand-bright"
              : "cursor-not-allowed bg-brand/40 text-canvas/70",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? "Uploading…" : "Upload & queue QA"}
        </button>

        {disabled ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
            Demo mode — connect Supabase to enable uploads.
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-danger-soft">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-status-delivered">
            {success}
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-status-delivered" aria-hidden="true" />
          <span className="meta text-[9px] text-status-delivered">How QA works</span>
        </div>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-ink-muted">
          <li>· Triangle count checked against the UGC cap in the brief.</li>
          <li>· Texture resolution compared to the approved spec.</li>
          <li>· Attachment socket validated for R15 avatars.</li>
          <li>· Failures block the customer notification until overridden.</li>
        </ul>
        <Link
          href="/projects"
          className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-brand hover:text-brand-bright"
        >
          Open project pipeline →
        </Link>
      </div>
    </div>
  );
}
