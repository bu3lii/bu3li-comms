import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ApiError } from "./api/client";
import { ME_QUERY_KEY } from "./hooks/useMe";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
  queryCache: new QueryCache({
    // A 401 from any *other* query means the session died mid-use (the /me
    // query failing on its own is just the normal logged-out state, and
    // must not re-trigger itself here or it would refetch forever).
    onError: (error, query) => {
      const isMeQuery = query.queryKey[0] === ME_QUERY_KEY[0];
      if (!isMeQuery && error instanceof ApiError && error.isUnauthorized) {
        queryClient.setQueryData(ME_QUERY_KEY, undefined);
        void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      }
    },
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

// Production-only: the dev server's own module graph is a much better
// "instant reload" than a service worker, and registering one under Vite
// dev would fight HMR.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
