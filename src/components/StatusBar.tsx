import { APP_VERSION, COPYRIGHT } from "@/lib/ui/appMeta";
import { IconHelp } from "@/components/Icons";
import Tooltip from "@/components/Tooltip";
import { TOOLTIPS } from "@/lib/ui/tooltipText";

interface Props {
  ticker: string | null;
  documentCount: number;
  helpOpen: boolean;
  onToggleHelp: () => void;
}

/**
 * 最下部のステータスバー。
 *
 * **左・中央・右の 3 分割にしている。** 中央の権利表記を `mx-auto` で
 * 寄せるだけだと、左右の情報の長さ（銘柄名や件数）で中心がずれてしまうため、
 * 左右の枠に同じ比重（`1fr`）を持たせて位置を固定する。
 */
export default function StatusBar({
  ticker,
  documentCount,
  helpOpen,
  onToggleHelp,
}: Props) {
  return (
    <footer className="grid min-h-6 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-slate-800 bg-slate-900 px-3 t-label text-slate-500">
      {/* 左: 状態 */}
      <div className="flex min-w-0 items-center gap-4">
        <span className="shrink-0 text-emerald-500">● 準備完了</span>
        <span className="truncate">銘柄: {ticker ?? "—"}</span>
        {/* 狭いときは資料件数から先に隠す（中央の表記を潰さないため） */}
        <span className="hidden truncate lg:inline">
          読み込み済み資料: {documentCount} 件
        </span>
      </div>

      {/* 中央: 権利表記 */}
      <div className="justify-self-center whitespace-nowrap text-center text-slate-600">
        {COPYRIGHT}
      </div>

      {/* 右: ヘルプとバージョン */}
      <div className="flex items-center justify-end gap-3">
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

        <span className="shrink-0 whitespace-nowrap font-mono">v{APP_VERSION}</span>
      </div>
    </footer>
  );
}
