import { useState, type DragEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { CurrentUserRow } from "../layout/CurrentUserRow";
import {
  useDeleteChannel,
  useDeleteServer,
  useReorderChannels,
  useRemoveServerMember,
} from "../../hooks/useServerMutations";
import { useVoiceChannelParticipants } from "../../stores/voiceChannelStore";
import { serverBannerUrl } from "../../api/servers";
import { VoiceIcon } from "../../calls/components/icons";
import type { ServerChannel, ServerSummary } from "../../types/server";
import type { User } from "../../types/user";

export function ServerChannelList({ server, currentUser }: { server: ServerSummary; currentUser: User }) {
  const { permissions } = server;
  const navigate = useNavigate();
  const deleteServer = useDeleteServer();
  const removeMember = useRemoveServerMember();
  const reorderChannels = useReorderChannels();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Drag-and-drop reordering: kept as local state so a drag feels
  // immediate, reconciled into the server's real order on drop. Resyncing
  // from `server.channels` happens during render (React's supported
  // "adjusting state when a prop changes" pattern) rather than in an
  // effect, and is skipped mid-drag so a realtime update from someone else
  // can't yank the list out from under the user.
  const [orderedChannels, setOrderedChannels] = useState(server.channels);
  const [syncedChannels, setSyncedChannels] = useState(server.channels);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const canReorder = permissions.manage_channels;

  if (server.channels !== syncedChannels && !draggedId) {
    setSyncedChannels(server.channels);
    setOrderedChannels(server.channels);
  }

  function handleDragOver(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    setOrderedChannels((current) => {
      const fromIndex = current.findIndex((c) => c.id === draggedId);
      const toIndex = current.findIndex((c) => c.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return current;

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      return next;
    });
  }

  function handleDragEnd() {
    if (draggedId) {
      reorderChannels.mutate({ serverId: server.id, channelIds: orderedChannels.map((c) => c.id) });
    }
    setDraggedId(null);
  }

  return (
    // Keyed by server id so switching servers (same ServerPage instance,
    // just a different rail icon clicked) remounts this whole panel and
    // replays the smooth-mode entrance animation, instead of the content
    // silently swapping in place.
    <div key={server.id} className="smooth-swap flex min-h-0 flex-1 flex-col">
      {server.has_banner && (
        <img src={serverBannerUrl(server.id)} alt="" className="h-20 w-full shrink-0 object-cover" loading="lazy" />
      )}

      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="truncate font-display text-base font-semibold text-text-primary">{server.name}</h1>
          <span className="flex shrink-0 items-center gap-1">
            {permissions.manage_server && (
              <Link
                to={`/servers/${server.id}/settings`}
                aria-label="Server settings"
                title="Server settings"
                className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:text-text-primary"
              >
                <GearIcon />
              </Link>
            )}
            <InviteMemberDialog serverId={server.id} existingMembers={server.members} />
            {permissions.is_owner ? (
              confirmingDelete ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => deleteServer.mutate(server.id, { onSuccess: () => navigate("/chat", { replace: true }) })}
                    className="font-medium text-danger"
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} className="text-text-secondary">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete server"
                  title="Delete server"
                  className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:text-danger"
                >
                  <TrashIcon />
                </button>
              )
            ) : confirmingDelete ? (
              <span className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    removeMember.mutate(
                      { serverId: server.id, userId: currentUser.id },
                      { onSuccess: () => navigate("/chat", { replace: true }) },
                    )
                  }
                  className="font-medium text-danger"
                >
                  Leave
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-text-secondary">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Leave server"
                title="Leave server"
                className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:text-danger"
              >
                <LeaveIcon />
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="font-mono text-[0.65rem] uppercase tracking-wide text-text-tertiary">Channels</span>
          {permissions.manage_channels && <CreateChannelDialog serverId={server.id} />}
        </div>
        <div className="mt-1 flex flex-col gap-0.5">
          {orderedChannels.map((channel) => (
            <ChannelRow
              key={channel.id}
              server={server}
              channel={channel}
              canDelete={permissions.manage_channels}
              canReorder={canReorder}
              isDragging={draggedId === channel.id}
              onDragStart={() => setDraggedId(channel.id)}
              onDragOver={(e) => handleDragOver(e, channel.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>

      <CurrentUserRow user={currentUser} />
    </div>
  );
}

interface ChannelRowProps {
  server: ServerSummary;
  channel: ServerChannel;
  canDelete: boolean;
  canReorder: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function ChannelRow({ server, channel, canDelete, canReorder, isDragging, onDragStart, onDragOver, onDragEnd }: ChannelRowProps) {
  const voiceParticipants = useVoiceChannelParticipants(channel.conversation_id);
  const deleteChannel = useDeleteChannel();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (confirmingDelete) {
    return (
      <div className="flex items-center justify-between rounded-[8px] px-2 py-1.5 text-xs">
        <span className="text-text-secondary">Delete #{channel.name}?</span>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => deleteChannel.mutate({ serverId: server.id, channelId: channel.id })}
            className="font-medium text-danger"
          >
            Yes
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)} className="text-text-secondary">
            No
          </button>
        </span>
      </div>
    );
  }

  return (
    <div
      draggable={canReorder}
      onDragStart={canReorder ? onDragStart : undefined}
      onDragOver={canReorder ? onDragOver : undefined}
      onDrop={canReorder ? (e) => e.preventDefault() : undefined}
      onDragEnd={canReorder ? onDragEnd : undefined}
      className={`smooth-swap group flex items-center gap-1 rounded-[8px] transition-opacity ${
        isDragging ? "opacity-40" : ""
      } ${canReorder ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {canReorder && (
        <span
          className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        >
          <GripIcon />
        </span>
      )}
      <NavLink
        draggable={false}
        to={`/servers/${server.id}/${channel.conversation_id}`}
        className={({ isActive }) =>
          `flex flex-1 items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-sm transition-colors ${
            isActive ? "bg-surface-raised text-text-primary" : "text-text-secondary hover:bg-surface-raised/60"
          }`
        }
      >
        <span className="shrink-0 text-text-tertiary" aria-hidden="true">
          {channel.type === "voice" ? <VoiceIcon /> : <span className="font-mono">#</span>}
        </span>
        <span className="truncate">{channel.name}</span>
        {channel.type === "voice" && voiceParticipants.length > 0 && (
          <span className="ml-auto shrink-0 font-mono text-[0.65rem] text-online">{voiceParticipants.length}</span>
        )}
      </NavLink>
      {canDelete && (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete #${channel.name}`}
          className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary hover:text-danger group-hover:flex"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      <circle cx="2.5" cy="2.5" r="1.25" />
      <circle cx="7.5" cy="2.5" r="1.25" />
      <circle cx="2.5" cy="7" r="1.25" />
      <circle cx="7.5" cy="7" r="1.25" />
      <circle cx="2.5" cy="11.5" r="1.25" />
      <circle cx="7.5" cy="11.5" r="1.25" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 10.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M13 8c0 .3-.02.58-.07.86l1.35 1.05-1.28 2.2-1.6-.53c-.44.38-.95.68-1.5.87L9.5 14h-3l-.4-1.55a4.9 4.9 0 0 1-1.5-.87l-1.6.53-1.28-2.2 1.35-1.05a4.6 4.6 0 0 1 0-1.72L1.72 5.9 3 3.7l1.6.53c.44-.38.95-.68 1.5-.87L6.5 2h3l.4 1.36c.55.19 1.06.49 1.5.87l1.6-.53 1.28 2.2-1.35 1.05c.05.28.07.56.07.86Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 2H3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1H6M11 11l3-3-3-3M14 8H6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M12.5 4.5 12 13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1l-.5-8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
