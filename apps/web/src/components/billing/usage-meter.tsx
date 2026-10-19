export function UsageMeter({
  label,
  used,
  value,
  unit,
}: {
  label: string;
  used: number;
  value: number;
  unit?: string;
}) {
  const pct = value > 0 ? Math.min(100, Math.round((used / value) * 100)) : 0;
  const nearlyFull = pct >= 85;

  return (
    <div className="rounded border border-line bg-canvas px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="meta text-[9px]">{label}</span>
        <span className="font-mono text-[11px] text-ink-muted">
          {used}
          <span className="text-ink-dim">
            {" "}
            / {value}
            {unit ? ` ${unit}` : ""}
          </span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={nearlyFull ? "h-full bg-status-briefing" : "h-full bg-brand"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
