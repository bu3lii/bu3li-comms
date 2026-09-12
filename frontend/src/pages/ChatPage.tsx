import { useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Sidebar } from "../components/layout/Sidebar";
import { ServerRail } from "../components/servers/ServerRail";
import { ConversationView } from "../components/messages/ConversationView";
import { EmptyState } from "../components/ui/EmptyState";
import { useMe } from "../hooks/useMe";

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { data: user } = useMe();

  // RequireAuth guarantees `user` is loaded before this page renders.
  if (!user) {
    return null;
  }

  return (
    <AppShell rail={<ServerRail />} sidebar={<Sidebar user={user} />} mobilePane={conversationId ? "conversation" : "sidebar"}>
      {conversationId ? (
        <ConversationView conversationId={conversationId} currentUser={user} />
      ) : (
        <EmptyState
          title="Pick a conversation"
          description="Choose one from the sidebar, or start a new one."
        />
      )}
    </AppShell>
  );
}
