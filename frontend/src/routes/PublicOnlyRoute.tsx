import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMe } from "../hooks/useMe";
import { Spinner } from "../components/ui/Spinner";

/** Login/register pages: bounce an already-authenticated user straight into chat. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe();

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}
