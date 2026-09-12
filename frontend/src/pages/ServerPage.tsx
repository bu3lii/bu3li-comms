import { useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { ServerRail } from "../components/servers/ServerRail";
import { ServerChannelList } from "../components/servers/ServerChannelList";
import { ServerMembersSidebar } from "../components/servers/ServerMembersSidebar";
import { ChannelConversationView } from "../components/messages/ChannelConversationView";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useMe } from "../hooks/useMe";
import { useServers } from "../hooks/useServers";

export function ServerPage() {
  const { serverId, conversationId } = useParams<{ serverId: string; conversationId?: string }>();
  const { data: user } = useMe();
  const { data: servers, isLoading } = useServers();

  // RequireAuth guarantees `user` is loaded before this page renders.
  if (!user) {
    return null;
  }

  const server = servers?.find((s) => s.id === serverId);
  const channel = server?.channels.find((c) => c.conversation_id === conversationId);

  return (
    <AppShell
      rail={<ServerRail activeServerId={serverId} />}
      sidebar={
        server ? (
          <ServerChannelList server={server} currentUser={user} />
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : null
      }
      rightPanel={server ? <ServerMembersSidebar server={server} currentUserId={user.id} /> : undefined}
      mobilePane={conversationId ? "conversation" : "sidebar"}
    >
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : !server ? (
        <EmptyState title="Server not found" description="You may not be a member of this server, or it doesn't exist." />
      ) : conversationId && channel ? (
        <ChannelConversationView server={server} channel={channel} currentUser={user} />
      ) : (
        <EmptyState title={server.name} description="Pick a channel from the sidebar, or create one." />
      )}
    </AppShell>
  );
}
