import { useMutation, useQueryClient } from "@tanstack/react-query";
import { login, logout, register, type LoginInput, type RegisterInput } from "../api/auth";
import { ME_QUERY_KEY } from "./useMe";
import { realtimeSocket } from "../realtime/socket";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    // POST /users only creates the account; it doesn't set a session cookie,
    // so we log in immediately after with the same credentials.
    mutationFn: async (input: RegisterInput) => {
      await register(input);
      return login({ email: input.email, password: input.password });
    },
    onSuccess: (user) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      realtimeSocket.disconnect();
      queryClient.clear();
    },
  });
}
