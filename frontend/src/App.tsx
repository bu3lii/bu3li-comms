import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ChatPage } from "./pages/ChatPage";
import { ServerPage } from "./pages/ServerPage";
import { ServerSettingsPage } from "./pages/ServerSettingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { RequireAuth } from "./routes/RequireAuth";
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute";
import { Toaster } from "./components/ui/Toaster";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { useApplyMotion } from "./hooks/useApplyMotion";

export function App() {
  useApplyTheme();
  useApplyMotion();

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/chat/:conversationId"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/servers/:serverId"
          element={
            <RequireAuth>
              <ServerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/servers/:serverId/:conversationId"
          element={
            <RequireAuth>
              <ServerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/servers/:serverId/settings"
          element={
            <RequireAuth>
              <ServerSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
