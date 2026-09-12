import { useQuery } from "@tanstack/react-query";
import { listConversations } from "../api/conversations";

export function conversationsQueryKey() {
  return ["conversations"] as const;
}

export function useConversations() {
  return useQuery({
    queryKey: conversationsQueryKey(),
    queryFn: listConversations,
  });
}
