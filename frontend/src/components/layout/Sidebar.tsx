import { SidebarHeader } from "./SidebarHeader";
import { CurrentUserRow } from "./CurrentUserRow";
import { ConversationList } from "../conversations/ConversationList";
import { NewConversationDialog } from "../conversations/NewConversationDialog";
import type { User } from "../../types/user";

export function Sidebar({ user }: { user: User }) {
  return (
    <>
      <SidebarHeader />
      <NewConversationDialog />
      <ConversationList currentUserId={user.id} />
      <CurrentUserRow user={user} />
    </>
  );
}
