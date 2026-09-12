import { Link } from "react-router-dom";
import { useMe } from "../hooks/useMe";
import { ProfileSettings } from "../components/settings/ProfileSettings";
import { PasswordSettings } from "../components/settings/PasswordSettings";
import { AppearanceSettings } from "../components/settings/AppearanceSettings";
import { AudioSettings } from "../components/settings/AudioSettings";

export function SettingsPage() {
  const { data: user } = useMe();

  // RequireAuth guarantees `user` is loaded before this page renders.
  if (!user) {
    return null;
  }

  return (
    <div className="smooth-swap min-h-dvh bg-canvas text-text-primary">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-6">
        <Link
          to="/chat"
          aria-label="Back to chat"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-raised hover:text-text-primary"
        >
          <BackIcon />
        </Link>
        <h1 className="font-display text-lg font-semibold">Settings</h1>
      </header>
      <main className="mx-auto max-w-2xl px-6 pb-16">
        <ProfileSettings user={user} />
        <PasswordSettings />
        <AppearanceSettings />
        <AudioSettings />
      </main>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M11 4 6 9l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
