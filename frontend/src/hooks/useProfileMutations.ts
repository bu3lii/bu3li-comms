import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePassword, updateProfile } from "../api/auth";
import { ME_QUERY_KEY } from "./useMe";

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
