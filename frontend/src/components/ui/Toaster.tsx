import { useToastStore, type ToastTone } from "../../stores/toastStore";

const TONE_CLASSES: Record<ToastTone, string> = {
  info: "border-border-strong bg-surface-raised text-text-primary",
  success: "border-online/40 bg-surface-raised text-text-primary",
  error: "border-danger/40 bg-surface-raised text-text-primary",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-rise-in pointer-events-auto flex max-w-md items-center gap-3 rounded-[8px] border px-3.5 py-2.5 text-sm shadow-lg ${TONE_CLASSES[toast.tone]}`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
