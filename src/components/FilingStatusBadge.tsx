import type { FilingStatus } from "@/types";
import { filingSignal } from "@/lib/api/sec";

interface Props {
  status: FilingStatus | null;
  loading: boolean;
  error: string | null;
}

const FRAME: Record<string, string> = {
  green: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
  yellow: "border-amber-800 bg-amber-950/40 text-amber-300",
  red: "border-red-900 bg-red-950/40 text-red-300",
};

/** 資料準備インジケーター（🟢 / 🟡 / 🔴）。 */
export default function FilingStatusBadge({ status, loading, error }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-500">
        <span className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-emerald-500" />
        SEC 提出状況を確認中…
      </div>
    );
  }

  if (error) {
    return (
      <div
        title={error}
        className="flex items-center gap-2 rounded-md border border-red-900 bg-red-950/40 px-2.5 py-1.5 text-[12px] text-red-300"
      >
        <span aria-hidden="true">🔴</span>
        SEC 資料: 確認失敗
      </div>
    );
  }

  const info = filingSignal(status);

  return (
    <div
      title={info.detail}
      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] ${FRAME[info.signal]}`}
    >
      <span aria-hidden="true">{info.emoji}</span>
      <span className="font-medium">SEC 資料: {info.label}</span>
      {status?.latest10k && (
        <span className="font-mono text-[11px] opacity-70">10-K {status.latest10k.filed}</span>
      )}
      {status?.latest10q && (
        <span className="font-mono text-[11px] opacity-70">10-Q {status.latest10q.filed}</span>
      )}
    </div>
  );
}
