import { useUserDirectory } from "./useUserDirectory";
import { useMe } from "./useMe";

export interface DisplayName {
  text: string;
  isKnown: boolean;
}

/** Resolves a user id to a username via conversation membership data, or an honest "Unknown" fallback. */
export function useDisplayName(userId: string): DisplayName {
  const { data: me } = useMe();
  const directory = useUserDirectory();

  if (me && userId === me.id) {
    return { text: "You", isKnown: true };
  }

  const username = directory.get(userId);
  if (username) {
    return { text: username, isKnown: true };
  }

  return { text: `Unknown (${userId.slice(0, 8)})`, isKnown: false };
}
