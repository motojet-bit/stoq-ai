import type { AppSettings } from "@/types";
import { providerLabel, providerReadiness, providerShortLabel } from "@/lib/config/providers";
import { IconKey } from "@/components/Icons";

interface Props {
  settings: AppSettings | null;
  /** クリックで設定モーダルを開く */
  onOpenSettings: () => void;
}

/**
 * APIキーの状態インジケーター。
 * 実キーは表示せず、Rust 側でマスクされた文字列のみを出す。クリックで設定を開く。
 */
export default function ApiKeyIndicator({ settings, onOpenSettings }: Props) {
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      title="クリックして設定を開く"
      className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-800"
    >
      <IconKey className="h-4 w-4 shrink-0 text-slate-500" />
      {settings === null ? (
        <span className="text-[12px] text-slate-600">設定を読み込み中…</span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {settings.keys.map((k) => {
            const active = k.provider === settings.provider;
            const { ready, reason } = providerReadiness(settings, k.provider);
            return (
              <span
                key={k.provider}
                title={
                  ready
                    ? `${providerLabel(settings, k.provider)}: 設定済み（${k.masked}）`
                    : `${providerLabel(settings, k.provider)}: ${reason ?? "未設定"}`
                }
                className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
                  ready
                    ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
                    : "border-slate-700 bg-slate-900 text-slate-500"
                } ${active ? "ring-1 ring-emerald-500/60" : ""}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    ready ? "bg-emerald-400" : "bg-slate-600"
                  }`}
                />
                <span className="max-w-24 truncate font-medium">
                  {providerShortLabel(settings, k.provider)}
                </span>
              </span>
            );
          })}
        </span>
      )}
    </button>
  );
}
