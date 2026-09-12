import { useState, type FormEvent } from "react";
import { SettingsSection } from "./SettingsSection";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useUpdatePassword } from "../../hooks/useProfileMutations";
import { useToastStore } from "../../stores/toastStore";
import { ApiError } from "../../api/client";

const MIN_PASSWORD_LENGTH = 8;

export function PasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const updatePassword = useUpdatePassword();
  const pushToast = useToastStore((s) => s.push);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    updatePassword.mutate(
      { current_password: currentPassword, new_password: newPassword },
      {
        onSuccess: () => {
          pushToast("Password changed.", "success");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        },
        onError: (err) => {
          if (err instanceof ApiError && err.isUnauthorized) {
            setError("Current password is incorrect.");
          } else {
            setError("Couldn't change your password. Try again.");
          }
        },
      },
    );
  }

  return (
    <SettingsSection title="Password" description="Change your password.">
      <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          loading={updatePassword.isPending}
          disabled={!currentPassword || !newPassword}
          className="self-start"
        >
          Change password
        </Button>
      </form>
    </SettingsSection>
  );
}
