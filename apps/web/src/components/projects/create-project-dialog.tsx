"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, TriangleAlert } from "lucide-react";

import { createProject } from "@/app/(dashboard)/projects/actions";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export interface CustomerOption {
  id: string;
  displayName: string;
  discordUsername: string;
}

interface CreateProjectDialogProps {
  customers: CustomerOption[];
  disabled?: boolean;
}

const PROJECT_TYPES: { value: string; label: string }[] = [
  { value: "clothing", label: "Clothing" },
  { value: "accessory", label: "Accessory" },
  { value: "avatar_item", label: "Avatar Item" },
  { value: "game_asset", label: "Game Asset" },
  { value: "other", label: "Other" },
];

const inputClass =
  "mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-2.5 text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none disabled:opacity-60";

export function CreateProjectDialog({ customers, disabled = false }: CreateProjectDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"existing" | "new">(
    customers.length > 0 ? "existing" : "new",
  );
  const [title, setTitle] = useState("");
  const [projectType, setProjectType] = useState("clothing");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerDiscord, setCustomerDiscord] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priceUsd, setPriceUsd] = useState("");

  function reset() {
    setTitle("");
    setProjectType("clothing");
    setCustomerName("");
    setCustomerDiscord("");
    setDeadline("");
    setPriceUsd("");
    setError(null);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await createProject({
      title,
      projectType,
      customerId: mode === "existing" ? customerId || undefined : undefined,
      customerName: mode === "new" ? customerName : undefined,
      customerDiscordUsername: mode === "new" ? customerDiscord : undefined,
      deadline: deadline || undefined,
      priceUsd: priceUsd.trim() ? Number(priceUsd) : null,
    });
    setBusy(false);

    if (result.ok) {
      reset();
      setOpen(false);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Connect Supabase to create projects" : undefined}
        className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas shadow-focus transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Manual Project Order
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Manual Project Order"
        description="Capture a commission that did not arrive through Discord."
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="meta">Project title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Cyber samurai katana set"
              autoFocus
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="meta">Type</span>
              <select
                value={projectType}
                onChange={(event) => setProjectType(event.target.value)}
                className={inputClass}
              >
                {PROJECT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="meta">Deadline</span>
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="rounded border border-line bg-surface-1 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("existing")}
                disabled={customers.length === 0}
                className={cn(
                  "h-8 rounded px-3 text-[12px] font-medium transition-colors disabled:opacity-40",
                  mode === "existing"
                    ? "bg-brand text-canvas"
                    : "border border-line text-ink-muted hover:text-ink",
                )}
              >
                Existing customer
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={cn(
                  "h-8 rounded px-3 text-[12px] font-medium transition-colors",
                  mode === "new"
                    ? "bg-brand text-canvas"
                    : "border border-line text-ink-muted hover:text-ink",
                )}
              >
                New customer
              </button>
            </div>

            {mode === "existing" ? (
              <label className="mt-3 block">
                <span className="meta">Customer</span>
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  disabled={customers.length === 0}
                  className={inputClass}
                >
                  {customers.length === 0 ? (
                    <option value="">No customers yet</option>
                  ) : (
                    customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.displayName}
                        {customer.discordUsername ? ` · @${customer.discordUsername}` : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="meta">Display name</span>
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Client name"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="meta">Discord username</span>
                  <input
                    value={customerDiscord}
                    onChange={(event) => setCustomerDiscord(event.target.value)}
                    placeholder="optional"
                    className={inputClass}
                  />
                </label>
              </div>
            )}
          </div>

          <label className="block">
            <span className="meta">Price (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={priceUsd}
              onChange={(event) => setPriceUsd(event.target.value)}
              placeholder="optional"
              className={inputClass}
            />
          </label>

          {error ? (
            <p className="flex items-start gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-danger-soft">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="inline-flex h-11 items-center rounded border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:border-brand disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
