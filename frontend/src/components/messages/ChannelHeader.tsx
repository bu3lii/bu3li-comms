import { Link } from "react-router-dom";
import { VoiceIcon } from "../../calls/components/icons";
import type { ServerChannel, ServerSummary } from "../../types/server";

export function ChannelHeader({ server, channel }: { server: ServerSummary; channel: ServerChannel }) {
  return (
    <header className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3">
      <Link
        to={`/servers/${server.id}`}
        className="-ml-1 flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised md:hidden"
        aria-label="Back to channels"
      >
        <BackIcon />
      </Link>
      <span className="text-text-tertiary" aria-hidden="true">
        {channel.type === "voice" ? <VoiceIcon /> : <span className="font-mono text-lg leading-none">#</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{channel.name}</p>
        <p className="truncate text-xs text-text-tertiary">{server.name}</p>
      </div>
    </header>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M11 4 6 9l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
