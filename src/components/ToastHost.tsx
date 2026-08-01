import { dismissToast, useToasts, type ToastKind } from "@/lib/ui/toastStore";
import { IconClose } from "@/components/Icons";

const STYLES: Record<ToastKind, { frame: string; accent: string; icon: string }> = {
  error: { frame: "border-red-900 bg-red-950/90", accent: "text-red-300", icon: "✕" },
  warning: { frame: "border-amber-900 bg-amber-950/90", accent: "text-amber-300", icon: "!" },
  success: {
    frame: "border-emerald-900 bg-emerald-950/90",
    accent: "text-emerald-300",
    icon: "✓",
  },
  info: { frame: "border-slate-700 bg-slate-900/95", accent: "text-slate-300", icon: "i" },
};

/** 画面右下に重ねて表示するトースト通知。 */
export default function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-200 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const style = STYLES[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-xl shadow-black/40 backdrop-blur ${style.frame}`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${style.accent}`}
            >
              {style.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[12px] font-medium ${style.accent}`}>{t.title}</p>
              {t.detail && (
                <p className="selectable mt-0.5 break-words text-[11px] leading-relaxed text-slate-400">
                  {t.detail}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="通知を閉じる"
              className="rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
            >
              <IconClose className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
