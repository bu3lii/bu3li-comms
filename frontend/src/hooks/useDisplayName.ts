import { useUserDirectory } from "./useUserDirectory";
import { useMe } from "./useMe";

export interface DisplayName {
  text: string;
  isKnown: boolean;
  hasAvatar: boolean;
}

/** Resolves a user id to a username via conversation membership data, or an honest "Unknown" fallback. */
export function useDisplayName(userId: string): DisplayName {
  const { data: me } = useMe();
  const directory = useUserDirectory();

  if (me && userId === me.id) {
    return { text: "You", isKnown: true, hasAvatar: me.has_avatar };
  }

  const entry = directory.get(userId);
  if (entry) {
    return { text: entry.username, isKnown: true, hasAvatar: entry.hasAvatar };
  }

  return { text: `Unknown (${userId.slice(0, 8)})`, isKnown: false, hasAvatar: false };
}
