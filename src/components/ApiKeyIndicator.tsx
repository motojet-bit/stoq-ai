import type { ApiKeyStatus } from "@/types";
import { IconKey } from "@/components/Icons";

interface Props {
  statuses: ApiKeyStatus[];
}

/**
 * APIキーの状態インジケーター。
 * 実キーは表示せず、マスク済み文字列のみを出す。
 */
export default function ApiKeyIndicator({ statuses }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <IconKey className="h-4 w-4 text-slate-500" />
      {statuses.map((s) => (
        <div
          key={s.provider}
          title={
            s.configured
              ? `${s.label}: 設定済み（${s.masked}）`
              : `${s.label}: 未設定 — .env に APIキーを設定してください`
          }
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
            s.configured
              ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
              : "border-slate-700 bg-slate-900 text-slate-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              s.configured ? "bg-emerald-400" : "bg-slate-600"
            }`}
          />
          <span className="font-medium">{s.label}</span>
          <span className="font-mono text-[11px] opacity-80">
            {s.configured ? s.masked : "未設定"}
          </span>
        </div>
      ))}
    </div>
  );
}
