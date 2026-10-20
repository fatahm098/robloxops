"use client";

const PROMPTS = [
  "Apa yang harus kukerjakan hari ini?",
  "Ringkas proyek yang sedang berjalan",
  "Tambah proyek baru",
  "Ada revisi yang belum dikerjakan?",
];

export function QuickPrompts({
  disabled = false,
  onPick,
}: {
  disabled?: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          onClick={() => onPick(prompt)}
          className="rounded-full border border-line-strong bg-surface-1 px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
