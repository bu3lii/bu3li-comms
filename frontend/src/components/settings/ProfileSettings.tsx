import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { SettingsSection } from "./SettingsSection";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { useUpdateProfile, useUploadAvatar, useDeleteAvatar } from "../../hooks/useProfileMutations";
import { useToastStore } from "../../stores/toastStore";
import { ApiError } from "../../api/client";
import type { User } from "../../types/user";

export function ProfileSettings({ user }: { user: User }) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [error, setError] = useState<string | null>(null);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const pushToast = useToastStore((s) => s.push);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      pushToast("Choose an image file for your avatar.", "error");
      return;
    }

    uploadAvatar.mutate(file, {
      onSuccess: () => pushToast("Avatar updated.", "success"),
      onError: () => pushToast("Couldn't upload that avatar. Try again.", "error"),
    });
  }

  return (
    <SettingsSection title="Profile" description="Your username, email, and profile picture.">
      <div className="mb-6 flex items-center gap-4">
        <Avatar seed={user.id} name={user.username} userId={user.id} hasAvatar={user.has_avatar} size="lg" />
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              loading={uploadAvatar.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {user.has_avatar ? "Change picture" : "Upload picture"}
            </Button>
            {user.has_avatar && (
              <Button
                type="button"
                variant="ghost"
                loading={deleteAvatar.isPending}
                onClick={() =>
                  deleteAvatar.mutate(undefined, {
                    onSuccess: () => pushToast("Avatar removed.", "success"),
                    onError: () => pushToast("Couldn't remove your avatar. Try again.", "error"),
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-text-tertiary">PNG, JPEG, WebP, or GIF.</p>
        </div>
      </div>

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
