export function DiscordRelay({ guild }: { guild: string }) {
  return (
    <section className="panel" aria-labelledby="discord-relay-title">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 id="discord-relay-title" className="text-headline-sm text-ink">
          Discord Relay
        </h2>
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded border border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.12)] px-2 font-mono text-[10px] uppercase leading-none tracking-[0.04em] text-status-delivered">
          <span className="h-1 w-1 rounded-full bg-status-delivered" aria-hidden="true" />
          Connected
        </span>
      </header>

      <p className="px-4 pb-4 text-body-sm leading-relaxed text-ink-muted">
        Listening to <span className="font-mono text-[11px] text-brand">#commissions</span>,{" "}
        <span className="font-mono text-[11px] text-brand">#client-tickets</span>, and 14 private
        client threads. Auto-synced with Roblox Studio plug-in on{" "}
        <span className="font-mono text-[11px] text-ink-muted">{guild}</span>.
      </p>

      <footer className="flex items-center justify-between border-t border-line px-4 py-2.5 font-mono text-[10px] text-ink-dim">
        <span>
          Ping: <span className="tabular text-ink-muted">18ms</span>
        </span>
        <span>
          Uptime: <span className="tabular text-status-delivered">99.98%</span>
        </span>
      </footer>
    </section>
  );
}
