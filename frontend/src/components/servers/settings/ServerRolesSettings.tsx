import { useState, type FormEvent } from "react";
import { SettingsSection } from "../../settings/SettingsSection";
import { Input } from "../../ui/Input";
import { Button } from "../../ui/Button";
import { useCreateRole, useDeleteRole, useUpdateRole } from "../../../hooks/useServerMutations";
import type { RoleInput, ServerRole, ServerSummary } from "../../../types/server";

type PermissionKey = "can_manage_server" | "can_manage_channels" | "can_manage_roles" | "can_kick_members";

const PERMISSION_FIELDS: { key: PermissionKey; label: string; description: string }[] = [
  { key: "can_manage_server", label: "Manage server", description: "Edit the server's name, icon, and banner." },
  { key: "can_manage_channels", label: "Manage channels", description: "Create and delete channels." },
  { key: "can_manage_roles", label: "Manage roles", description: "Create, edit, and delete roles, and assign them to members." },
  { key: "can_kick_members", label: "Kick members", description: "Remove members from the server." },
];

export function ServerRolesSettings({ server }: { server: ServerSummary }) {
  const [creating, setCreating] = useState(false);

  return (
    <SettingsSection title="Roles" description="Localized, per-server permissions — every member has exactly one role.">
      <div className="flex flex-col gap-3">
        {server.roles.map((role) => (
          <RoleRow key={role.id} serverId={server.id} role={role} />
        ))}
      </div>

      {creating ? (
        <div className="mt-3">
          <RoleEditor serverId={server.id} onDone={() => setCreating(false)} />
        </div>
      ) : (
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setCreating(true)}>
          + New role
        </Button>
      )}
    </SettingsSection>
  );
}

function RoleRow({ serverId, role }: { serverId: string; role: ServerRole }) {
  const [isEditing, setIsEditing] = useState(false);
  const deleteRole = useDeleteRole();

  if (isEditing) {
    return <RoleEditor serverId={serverId} role={role} onDone={() => setIsEditing(false)} />;
  }

  return (
    <div className="flex items-center justify-between rounded-[8px] border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} aria-hidden="true" />
        <span className="text-sm font-medium">{role.name}</span>
        {role.is_default && <span className="font-mono text-[0.6rem] uppercase text-text-tertiary">default</span>}
        {role.is_admin && <span className="font-mono text-[0.6rem] uppercase text-accent">admin</span>}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={() => setIsEditing(true)} className="font-medium text-accent hover:text-accent-strong">
          Edit
        </button>
        {!role.is_default && (
          <button
            type="button"
            onClick={() => deleteRole.mutate({ serverId, roleId: role.id })}
            className="text-text-tertiary hover:text-danger"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function RoleEditor({ serverId, role, onDone }: { serverId: string; role?: ServerRole; onDone: () => void }) {
  const [name, setName] = useState(role?.name ?? "New role");
  const [color, setColor] = useState(role?.color ?? "#7C9CE8");
  const [permissions, setPermissions] = useState({
    is_admin: role?.is_admin ?? false,
    can_manage_server: role?.can_manage_server ?? false,
    can_manage_channels: role?.can_manage_channels ?? false,
    can_manage_roles: role?.can_manage_roles ?? false,
    can_kick_members: role?.can_kick_members ?? false,
  });
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const isPending = createRole.isPending || updateRole.isPending;

  function toggle(key: PermissionKey | "is_admin") {
    setPermissions((p) => ({ ...p, [key]: !p[key] }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const input: RoleInput = { name: trimmed, color, ...permissions };
    if (role) {
      updateRole.mutate({ serverId, roleId: role.id, input }, { onSuccess: onDone });
    } else {
      createRole.mutate({ serverId, input }, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-[8px] border border-border-strong bg-surface-sunken p-3">
      <div className="flex items-end gap-2">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" autoFocus />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-secondary" htmlFor={`${role?.id ?? "new"}-color`}>
            Color
          </label>
          <input
            id={`${role?.id ?? "new"}-color`}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-[38px] w-12 cursor-pointer rounded-[8px] border border-border-strong bg-transparent p-1"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={permissions.is_admin} onChange={() => toggle("is_admin")} className="mt-0.5 accent-accent" />
          <span>
            <span className="font-medium text-text-primary">Administrator</span>
            <span className="block text-xs text-text-tertiary">Grants every permission below, regardless of their individual settings.</span>
          </span>
        </label>
        {PERMISSION_FIELDS.map(({ key, label, description }) => (
          <label key={key} className={`flex items-start gap-2 text-sm ${permissions.is_admin ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={permissions.is_admin || permissions[key]}
              disabled={permissions.is_admin}
              onChange={() => toggle(key)}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="font-medium text-text-primary">{label}</span>
              <span className="block text-xs text-text-tertiary">{description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={isPending} disabled={!name.trim()}>
          Save role
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
