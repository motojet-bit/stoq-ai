import type { AppSettings } from "@/types";
import { providerLabel } from "@/lib/config/providers";
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
      className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-800"
    >
      <IconKey className="h-4 w-4 text-slate-500" />
      {settings === null ? (
        <span className="text-[12px] text-slate-600">設定を読み込み中…</span>
      ) : (
        settings.keys.map((k) => {
          const active = k.provider === settings.provider;
          return (
            <span
              key={k.provider}
              title={
                k.configured
                  ? `${providerLabel(k.provider)}: 設定済み（${k.masked}）`
                  : `${providerLabel(k.provider)}: 未設定`
              }
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
                k.configured
                  ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-500"
              } ${active ? "ring-1 ring-emerald-500/60" : ""}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  k.configured ? "bg-emerald-400" : "bg-slate-600"
                }`}
              />
              <span className="font-medium">{providerLabel(k.provider).split(" ")[0]}</span>
            </span>
          );
        })
      )}
    </button>
  );
}
