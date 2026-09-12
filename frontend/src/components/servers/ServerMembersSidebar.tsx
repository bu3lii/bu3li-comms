import { useMemo, useState } from "react";
import { usePresenceStore } from "../../stores/presenceStore";
import { Avatar } from "../ui/Avatar";
import { Spinner } from "../ui/Spinner";
import { MemberProfileModal } from "./MemberProfileModal";
import type { ServerMember, ServerSummary } from "../../types/server";

/**
 * Right-hand members panel for a server: everyone grouped by online/offline
 * (the left channel sidebar intentionally shows no per-member presence —
 * that job lives here). Clicking a member opens their profile.
 */
export function ServerMembersSidebar({ server, currentUserId }: { server: ServerSummary; currentUserId: string }) {
  const onlineIds = usePresenceStore((s) => s.online);
  const [selected, setSelected] = useState<ServerMember | null>(null);

  const { online, offline } = useMemo(() => {
    const online: ServerMember[] = [];
    const offline: ServerMember[] = [];
    for (const member of server.members) {
      const isOnline = member.user_id === currentUserId || onlineIds.has(member.user_id);
      (isOnline ? online : offline).push(member);
    }
    return { online, offline };
  }, [server.members, onlineIds, currentUserId]);

  if (server.members.length === 0) {
    return (
      <div key={server.id} className="smooth-swap flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    // Keyed by server id for the same reason as ServerChannelList — remount
    // and replay the entrance animation when switching servers.
    <div key={server.id} className="smooth-swap flex h-full flex-col gap-4 overflow-y-auto px-3 py-4">
      <MemberGroup
        title="Online"
        members={online}
        onlineIds={onlineIds}
        currentUserId={currentUserId}
        onSelect={setSelected}
      />
      <MemberGroup
        title="Offline"
        members={offline}
        onlineIds={onlineIds}
        currentUserId={currentUserId}
        onSelect={setSelected}
        dimmed
      />

      {selected && <MemberProfileModal member={selected} serverName={server.name} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MemberGroup({
  title,
  members,
  onlineIds,
  currentUserId,
  onSelect,
  dimmed,
}: {
  title: string;
  members: ServerMember[];
  onlineIds: Set<string>;
  currentUserId: string;
  onSelect: (member: ServerMember) => void;
  dimmed?: boolean;
}) {
  if (members.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-1.5 px-1 font-mono text-[0.65rem] uppercase tracking-wide text-text-tertiary">
        {title} — {members.length}
      </p>
      <div className="flex flex-col gap-0.5">
        {members.map((member) => {
          const isOnline = member.user_id === currentUserId || onlineIds.has(member.user_id);
          return (
            <button
              key={member.user_id}
              type="button"
              onClick={() => onSelect(member)}
              className={`smooth-swap flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-raised/60 ${
                dimmed ? "opacity-60" : ""
              }`}
            >
              <span className="relative shrink-0">
                <Avatar seed={member.user_id} name={member.username} size="sm" userId={member.user_id} hasAvatar={member.has_avatar} />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface"
                  style={
                    isOnline
                      ? { backgroundColor: "var(--color-online)" }
                      : { backgroundColor: "var(--color-surface)", boxShadow: "inset 0 0 0 1.5px var(--color-text-tertiary)" }
                  }
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{member.username}</span>
              {!member.is_owner && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: member.role_color }}
                  title={member.role_name}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
