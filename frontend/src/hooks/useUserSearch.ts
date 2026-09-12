import { useQuery } from "@tanstack/react-query";
import { searchUsers } from "../api/users";
import { useDebouncedValue } from "./useDebouncedValue";

export function useUserSearch(query: string) {
  const debounced = useDebouncedValue(query, 250);

  return useQuery({
    queryKey: ["users", "search", debounced],
    queryFn: () => searchUsers(debounced),
    placeholderData: (previous) => previous,
  });
}
