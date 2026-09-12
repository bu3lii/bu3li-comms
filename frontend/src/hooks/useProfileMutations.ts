import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePassword, updateProfile } from "../api/auth";
import { deleteAvatar, uploadAvatar } from "../api/users";
import { resizeImageFile } from "../lib/image";
import { ME_QUERY_KEY } from "./useMe";
import type { User } from "../types/user";

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (user) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: updatePassword,
  });
}

const AVATAR_MAX_DIMENSION = 256;

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const resized = await resizeImageFile(file, AVATAR_MAX_DIMENSION);
      await uploadAvatar(resized);
    },
    onSuccess: () => {
      queryClient.setQueryData<User>(ME_QUERY_KEY, (old) => (old ? { ...old, has_avatar: true } : old));
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAvatar,
    onSuccess: () => {
      queryClient.setQueryData<User>(ME_QUERY_KEY, (old) => (old ? { ...old, has_avatar: false } : old));
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
