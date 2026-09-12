import { useState } from "react";
import { Link } from "react-router-dom";
import { useServers } from "../../hooks/useServers";
import { serverIconUrl } from "../../api/servers";
import { CreateServerDialog } from "./CreateServerDialog";
import type { ServerSummary } from "../../types/server";

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

/** Leftmost icon strip: direct messages "home", then one icon per server the user belongs to, then "create a server". */
export function ServerRail({ activeServerId }: { activeServerId?: string }) {
  const { data: servers = [] } = useServers();

  return (
    <>
      <Link
        to="/chat"
        aria-label="Direct messages"
        title="Direct messages"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] font-display text-xs font-semibold transition-colors ${
          !activeServerId
            ? "bg-accent text-accent-text"
            : "bg-surface-raised text-text-secondary hover:bg-accent/20 hover:text-accent"
        }`}
      >
        DM
      </Link>

      <div className="my-1 h-8 w-px shrink-0 bg-border md:h-px md:w-8" />

      {servers.map((server) => (
        <ServerRailIcon key={server.id} server={server} isActive={activeServerId === server.id} />
      ))}

      <CreateServerDialog />
    </>
  );
}

function ServerRailIcon({ server, isActive }: { server: ServerSummary; isActive: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = server.has_icon && !imageFailed;

  return (
    <Link
      to={`/servers/${server.id}`}
      aria-label={server.name}
      title={server.name}
      className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-sm font-semibold uppercase transition-colors ${
        isActive ? "bg-accent text-accent-text" : "bg-surface-raised text-text-secondary hover:bg-accent/20 hover:text-accent"
      }`}
    >
      {showImage ? (
        <img
          src={serverIconUrl(server.id)}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initialsFor(server.name)
      )}
    </Link>
  );
}
