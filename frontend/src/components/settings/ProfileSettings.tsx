import { useState, type FormEvent } from "react";
import { SettingsSection } from "./SettingsSection";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useUpdateProfile } from "../../hooks/useProfileMutations";
import { useToastStore } from "../../stores/toastStore";
import { ApiError } from "../../api/client";
import type { User } from "../../types/user";

export function ProfileSettings({ user }: { user: User }) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [error, setError] = useState<string | null>(null);
  const updateProfile = useUpdateProfile();
  const pushToast = useToastStore((s) => s.push);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !email.trim()) {
      setError("Username and email are required.");
      return;
    }

    updateProfile.mutate(
      { username: username.trim(), email: email.trim() },
      {
        onSuccess: () => pushToast("Profile updated.", "success"),
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict) {
            setError("That username or email is already taken.");
          } else {
            setError("Couldn't update your profile. Try again.");
          }
        },
      },
    );
  }

  return (
    <SettingsSection title="Profile" description="Your username and email.">
      <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
        <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={updateProfile.isPending} className="self-start">
          Save changes
        </Button>
      </form>
    </SettingsSection>
  );
}
