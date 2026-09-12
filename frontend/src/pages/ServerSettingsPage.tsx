import { Link, Navigate, useParams } from "react-router-dom";
import { useMe } from "../hooks/useMe";
import { useServers } from "../hooks/useServers";
import { ServerOverviewSettings } from "../components/servers/settings/ServerOverviewSettings";
import { ServerRolesSettings } from "../components/servers/settings/ServerRolesSettings";
import { ServerMembersSettings } from "../components/servers/settings/ServerMembersSettings";
import { Spinner } from "../components/ui/Spinner";

export function ServerSettingsPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { data: user } = useMe();
  const { data: servers, isLoading } = useServers();

  // RequireAuth guarantees `user` is loaded before this page renders.
  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Spinner />
      </div>
    );
  }

  const server = servers?.find((s) => s.id === serverId);
  if (!server) {
    return <Navigate to="/chat" replace />;
  }

  const { permissions } = server;
  const canManageAnything = permissions.manage_server || permissions.manage_roles || permissions.kick_members;
  if (!canManageAnything) {
    return <Navigate to={`/servers/${server.id}`} replace />;
  }

  return (
    <div className="smooth-swap min-h-dvh bg-canvas text-text-primary">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-6">
        <Link
          to={`/servers/${server.id}`}
          aria-label="Back to server"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised hover:text-text-primary"
        >
          <BackIcon />
        </Link>
        <h1 className="truncate font-display text-lg font-semibold">{server.name} settings</h1>
      </header>
      <main className="mx-auto max-w-2xl px-6 pb-16">
        {permissions.manage_server && <ServerOverviewSettings server={server} />}
        {permissions.manage_roles && <ServerRolesSettings server={server} />}
        {(permissions.manage_roles || permissions.kick_members) && (
          <ServerMembersSettings server={server} currentUserId={user.id} />
        )}
      </main>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M11 4 6 9l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
