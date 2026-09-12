import { useMemo } from "react";
import { useConversations } from "./useConversations";

/** Every username this client has ever seen, harvested from loaded conversation membership. */
export function useUserDirectory(): Map<string, string> {
  const { data: conversations } = useConversations();

  return useMemo(() => {
    const directory = new Map<string, string>();
    for (const conversation of conversations ?? []) {
      for (const member of conversation.members) {
        directory.set(member.id, member.username);
      }
    }
    return directory;
  }, [conversations]);
}
