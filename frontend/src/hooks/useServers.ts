import { useQuery } from "@tanstack/react-query";
import { listServers } from "../api/servers";

export function serversQueryKey() {
  return ["servers"] as const;
}

export function useServers() {
  return useQuery({
    queryKey: serversQueryKey(),
    queryFn: listServers,
  });
}
