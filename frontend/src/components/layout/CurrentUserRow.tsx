import { Link } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useLogout } from "../../hooks/useAuthMutations";
import type { User } from "../../types/user";

export function CurrentUserRow({ user }: { user: User }) {
  const logout = useLogout();

  return (
    <div className="mt-auto flex items-center gap-2.5 border-t border-border px-4 py-3">
      <Avatar seed={user.id} name={user.username} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{user.username}</p>
        <p className="truncate text-xs text-text-tertiary">{user.email}</p>
      </div>
      <Link
        to="/settings"
        aria-label="Settings"
        title="Settings"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised hover:text-text-primary"
      >
        <SettingsIcon />
      </Link>
      <Button
        variant="ghost"
        onClick={() => logout.mutate()}
        loading={logout.isPending}
        aria-label="Log out"
        title="Log out"
        className="!px-2"
      >
        <LogoutIcon />
      </Button>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 10.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M13 8c0 .3-.02.58-.07.86l1.35 1.05-1.28 2.2-1.6-.53c-.44.38-.95.68-1.5.87L9.5 14h-3l-.4-1.55a4.9 4.9 0 0 1-1.5-.87l-1.6.53-1.28-2.2 1.35-1.05a4.6 4.6 0 0 1 0-1.72L1.72 5.9 3 3.7l1.6.53c.44-.38.95-.68 1.5-.87L6.5 2h3l.4 1.36c.55.19 1.06.49 1.5.87l1.6-.53 1.28 2.2-1.35 1.05c.05.28.07.56.07.86Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 2H3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1H6M11 11l3-3-3-3M14 8H6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
