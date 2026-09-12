import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addServerMember,
  assignServerRole,
  createChannel,
  createRole,
  createServer,
  deleteChannel,
  deleteRole,
  deleteServer,
  deleteServerBanner,
  deleteServerIcon,
  removeServerMember,
  reorderChannels,
  updateRole,
  updateServer,
  uploadServerBanner,
  uploadServerIcon,
} from "../api/servers";
import { resizeImageFile } from "../lib/image";
import { serversQueryKey } from "./useServers";
import { useToastStore } from "../stores/toastStore";
import type { ChannelType, RoleInput, ServerChannel, ServerSummary } from "../types/server";

export function useCreateServer() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: (name: string) => createServer(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't create that server. Try again.", "error");
    },
  });
}

export function useUpdateServer() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, name }: { serverId: string; name: string }) => updateServer(serverId, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't update that server. Try again.", "error");
    },
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: (serverId: string) => deleteServer(serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't delete that server. Try again.", "error");
    },
  });
}

export function useAddServerMember() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, userId }: { serverId: string; userId: string }) => addServerMember(serverId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't add that member. Try again.", "error");
    },
  });
}

export function useRemoveServerMember() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, userId }: { serverId: string; userId: string }) => removeServerMember(serverId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't remove that member. Try again.", "error");
    },
  });
}

export function useAssignServerRole() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, userId, roleId }: { serverId: string; userId: string; roleId: string }) =>
      assignServerRole(serverId, userId, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't change that member's role. Try again.", "error");
    },
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, name, type }: { serverId: string; name: string; type: ChannelType }) =>
      createChannel(serverId, name, type),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't create that channel. Try again.", "error");
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, channelId }: { serverId: string; channelId: string }) => deleteChannel(serverId, channelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't delete that channel. Try again.", "error");
    },
  });
}

/**
 * Reorders a server's channels. Applies the new order to the cache
 * immediately (drag-and-drop needs to feel instant, not wait on a round
 * trip) and rolls back if the server rejects it.
 */
export function useReorderChannels() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, channelIds }: { serverId: string; channelIds: string[] }) =>
      reorderChannels(serverId, channelIds),
    onMutate: async ({ serverId, channelIds }) => {
      await queryClient.cancelQueries({ queryKey: serversQueryKey() });
      const previous = queryClient.getQueryData<ServerSummary[]>(serversQueryKey());

      queryClient.setQueryData<ServerSummary[]>(serversQueryKey(), (servers) =>
        servers?.map((server) => {
          if (server.id !== serverId) return server;

          const byId = new Map(server.channels.map((channel) => [channel.id, channel]));
          const reordered = channelIds
            .map((id, position) => {
              const channel = byId.get(id);
              return channel ? { ...channel, position } : undefined;
            })
            .filter((channel): channel is ServerChannel => channel !== undefined);

          return { ...server, channels: reordered };
        }),
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(serversQueryKey(), context.previous);
      }
      pushToast("Couldn't reorder channels. Try again.", "error");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, input }: { serverId: string; input: RoleInput }) => createRole(serverId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't create that role. Try again.", "error");
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, roleId, input }: { serverId: string; roleId: string; input: RoleInput }) =>
      updateRole(serverId, roleId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't update that role. Try again.", "error");
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: ({ serverId, roleId }: { serverId: string; roleId: string }) => deleteRole(serverId, roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't delete that role. Try again.", "error");
    },
  });
}

const SERVER_IMAGE_MAX_DIMENSION = 1024;

export function useUploadServerIcon() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: async ({ serverId, file }: { serverId: string; file: File }) => {
      const resized = await resizeImageFile(file, SERVER_IMAGE_MAX_DIMENSION);
      await uploadServerIcon(serverId, resized);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't upload that icon. Try again.", "error");
    },
  });
}

export function useDeleteServerIcon() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: (serverId: string) => deleteServerIcon(serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't remove that icon. Try again.", "error");
    },
  });
}

export function useUploadServerBanner() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: async ({ serverId, file }: { serverId: string; file: File }) => {
      const resized = await resizeImageFile(file, 1600);
      await uploadServerBanner(serverId, resized);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't upload that banner. Try again.", "error");
    },
  });
}

export function useDeleteServerBanner() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  return useMutation({
    mutationFn: (serverId: string) => deleteServerBanner(serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
    },
    onError: () => {
      pushToast("Couldn't remove that banner. Try again.", "error");
    },
  });
}
