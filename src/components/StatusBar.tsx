import { IconHelp } from "@/components/Icons";
import Tooltip from "@/components/Tooltip";
import { TOOLTIPS } from "@/lib/ui/tooltipText";

interface Props {
  ticker: string | null;
  documentCount: number;
  helpOpen: boolean;
  onToggleHelp: () => void;
}

/** 最下部のステータスバー */
export default function StatusBar({
  ticker,
  documentCount,
  helpOpen,
  onToggleHelp,
}: Props) {
  return (
    <footer className="flex min-h-6 shrink-0 items-center gap-4 border-t border-slate-800 bg-slate-900 px-3 t-label text-slate-500">
      <span className="text-emerald-500">● 準備完了</span>
      <span>銘柄: {ticker ?? "—"}</span>
      <span>読み込み済み資料: {documentCount} 件</span>

      {/* 使い方の質問はここから。バージョン表記の左に置く */}
      <span className="ml-auto shrink-0">
        <Tooltip content={TOOLTIPS.help} placement="top">
          <button
            type="button"
            onClick={onToggleHelp}
            aria-pressed={helpOpen}
            className={`flex shrink-0 items-center gap-1 rounded px-1.5 transition-colors ${
              helpOpen
                ? "bg-emerald-600 font-medium text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-emerald-300"
            }`}
          >
            <IconHelp className="h-3.5 w-3.5" />
            ヘルプ
          </button>
        </Tooltip>
      </span>

      <span className="shrink-0 font-mono">Phase 1 / v0.1.0</span>
    </footer>
  );
}
