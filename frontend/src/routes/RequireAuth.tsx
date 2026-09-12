import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "../hooks/useMe";
import { useRealtime } from "../hooks/useRealtime";
import { callManager } from "../calls/callManager";
import { Spinner } from "../components/ui/Spinner";
import { CallOverlay } from "../calls/components/CallOverlay";

/** Gate for authenticated routes: confirms the session via `/me`, then keeps one WebSocket connection alive for as long as any authenticated page is mounted. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError } = useMe();
  const location = useLocation();

  useRealtime(Boolean(user) && !isError);

  useEffect(() => {
    if (user) callManager.setSelfUserId(user.id);
  }, [user]);

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner />
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <>
      {children}
      <CallOverlay currentUserId={user.id} />
    </>
  );
}
