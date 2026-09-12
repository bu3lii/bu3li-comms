import { SettingsSection } from "../../settings/SettingsSection";
import { Avatar } from "../../ui/Avatar";
import { useAssignServerRole, useRemoveServerMember } from "../../../hooks/useServerMutations";
import type { ServerSummary } from "../../../types/server";

export function ServerMembersSettings({ server, currentUserId }: { server: ServerSummary; currentUserId: string }) {
  const assignRole = useAssignServerRole();
  const removeMember = useRemoveServerMember();
  const canAssignRoles = server.permissions.manage_roles;
  const canKick = server.permissions.kick_members;

  return (
    <SettingsSection title="Members" description={`${server.members.length} member${server.members.length === 1 ? "" : "s"}.`}>
      <div className="flex flex-col gap-1">
        {server.members.map((member) => (
          <div key={member.user_id} className="flex items-center gap-3 rounded-[8px] px-2 py-2 hover:bg-surface-raised/50">
            <Avatar seed={member.user_id} name={member.username} size="sm" userId={member.user_id} hasAvatar={member.has_avatar} />
            <span className="min-w-0 flex-1 truncate text-sm">{member.username}</span>

            {member.is_owner ? (
              <span className="font-mono text-[0.65rem] uppercase text-accent">Owner</span>
            ) : canAssignRoles ? (
              <select
                value={member.role_id ?? ""}
                onChange={(e) => assignRole.mutate({ serverId: server.id, userId: member.user_id, roleId: e.target.value })}
                disabled={assignRole.isPending}
                aria-label={`${member.username}'s role`}
                className="rounded-[6px] border border-border-strong bg-surface-sunken px-2 py-1 text-xs text-text-primary"
              >
                {server.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium" style={{ color: member.role_color }}>
                {member.role_name}
              </span>
            )}

            {!member.is_owner && canKick && member.user_id !== currentUserId && (
              <button
                type="button"
                onClick={() => removeMember.mutate({ serverId: server.id, userId: member.user_id })}
                aria-label={`Remove ${member.username}`}
                title={`Remove ${member.username}`}
                className="text-text-tertiary hover:text-danger"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
