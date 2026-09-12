import { useMemo } from "react";
import { useConversations } from "./useConversations";
import { useServers } from "./useServers";

export interface DirectoryEntry {
  username: string;
  hasAvatar: boolean;
}

/** Every user this client has ever seen, harvested from loaded conversation and server membership. */
export function useUserDirectory(): Map<string, DirectoryEntry> {
  const { data: conversations } = useConversations();
  const { data: servers } = useServers();

  return useMemo(() => {
    const directory = new Map<string, DirectoryEntry>();
    for (const conversation of conversations ?? []) {
      for (const member of conversation.members) {
        directory.set(member.id, { username: member.username, hasAvatar: member.has_avatar });
      }
    }
    for (const server of servers ?? []) {
      for (const member of server.members) {
        directory.set(member.user_id, { username: member.username, hasAvatar: member.has_avatar });
      }
    }
    return directory;
  }, [conversations, servers]);
}
