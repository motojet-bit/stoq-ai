import type { WorkspaceTab } from "@/types";
import { IconChart } from "@/components/Icons";

interface Props {
  tab: WorkspaceTab | undefined;
}

/** 指標カードのプレースホルダー */
const METRIC_PLACEHOLDERS = [
  "株価 / 時価総額",
  "PER / PBR / PSR",
  "売上・EPS 成長率",
  "営業利益率 / ROE",
  "フリーCF / 負債比率",
  "アナリスト予想",
];

/** アクティブなタブの内容（メインエリア上部） */
export default function WorkspacePanel({ tab }: Props) {
  if (!tab) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-slate-600">
        タブがありません
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-lg font-semibold text-slate-100">{tab.title}</h1>
        {tab.ticker && (
          <span className="rounded bg-emerald-950 px-1.5 py-0.5 font-mono text-[12px] text-emerald-300">
            {tab.ticker}
          </span>
        )}
      </header>

      <p className="selectable mb-5 max-w-2xl text-[13px] leading-relaxed text-slate-400">
        ここに銘柄のファンダメンタル指標・SEC提出書類の要約・PDF から抽出した論点が並びます。
        現在は Phase 1（スケルトンUI）のため、すべてプレースホルダーです。
      </p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {METRIC_PLACEHOLDERS.map((label) => (
          <div
            key={label}
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5"
          >
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400">
              <IconChart className="h-3.5 w-3.5 text-slate-600" />
              {label}
            </div>
            <div className="space-y-1.5">
              <div className="h-2.5 w-3/5 rounded bg-slate-800" />
              <div className="h-2.5 w-2/5 rounded bg-slate-800/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
