import { useRef, useState, type FormEvent } from "react";
import { SettingsSection } from "../../settings/SettingsSection";
import { Input } from "../../ui/Input";
import { Button } from "../../ui/Button";
import { serverBannerUrl, serverIconUrl } from "../../../api/servers";
import {
  useDeleteServerBanner,
  useDeleteServerIcon,
  useUpdateServer,
  useUploadServerBanner,
  useUploadServerIcon,
} from "../../../hooks/useServerMutations";
import { useToastStore } from "../../../stores/toastStore";
import type { ServerSummary } from "../../../types/server";

export function ServerOverviewSettings({ server }: { server: ServerSummary }) {
  const [name, setName] = useState(server.name);
  const updateServer = useUpdateServer();
  const uploadIcon = useUploadServerIcon();
  const deleteIcon = useDeleteServerIcon();
  const uploadBanner = useUploadServerBanner();
  const deleteBanner = useDeleteServerBanner();
  const pushToast = useToastStore((s) => s.push);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === server.name) return;
    updateServer.mutate(
      { serverId: server.id, name: trimmed },
      { onSuccess: () => pushToast("Server updated.", "success") },
    );
  }

  return (
    <SettingsSection title="Overview" description="Server name, icon, and banner.">
      <div className="mb-4 overflow-hidden rounded-[10px] border border-border">
        {server.has_banner ? (
          <img src={serverBannerUrl(server.id)} alt="" className="h-28 w-full object-cover" />
        ) : (
          <div className="flex h-28 w-full items-center justify-center bg-surface-sunken text-xs text-text-tertiary">
            No banner
          </div>
        )}
      </div>
      <div className="mb-6 flex gap-2">
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) uploadBanner.mutate({ serverId: server.id, file });
          }}
        />
        <Button type="button" variant="secondary" loading={uploadBanner.isPending} onClick={() => bannerInputRef.current?.click()}>
          {server.has_banner ? "Change banner" : "Upload banner"}
        </Button>
        {server.has_banner && (
          <Button type="button" variant="ghost" loading={deleteBanner.isPending} onClick={() => deleteBanner.mutate(server.id)}>
            Remove
          </Button>
        )}
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border border-border bg-surface-sunken">
          {server.has_icon ? (
            <img src={serverIconUrl(server.id)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[0.6rem] text-text-tertiary">
              No icon
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={iconInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) uploadIcon.mutate({ serverId: server.id, file });
            }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" loading={uploadIcon.isPending} onClick={() => iconInputRef.current?.click()}>
              {server.has_icon ? "Change icon" : "Upload icon"}
            </Button>
            {server.has_icon && (
              <Button type="button" variant="ghost" loading={deleteIcon.isPending} onClick={() => deleteIcon.mutate(server.id)}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-text-tertiary">PNG, JPEG, WebP, or GIF.</p>
        </div>
      </div>

      <form onSubmit={handleNameSubmit} className="flex max-w-sm flex-col gap-4">
        <Input label="Server name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button
          type="submit"
          loading={updateServer.isPending}
          disabled={!name.trim() || name.trim() === server.name}
          className="self-start"
        >
          Save changes
        </Button>
      </form>
    </SettingsSection>
  );
}
