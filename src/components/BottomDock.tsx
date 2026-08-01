import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import type { AnalysisRun } from "@/lib/prompts/analysisRunner";
import ResizableSplit, { type SplitDirection } from "@/components/ResizableSplit";
import AnalysisPanel from "@/components/AnalysisPanel";
import ChatPanel from "@/components/ChatPanel";
import { IconLayoutColumns, IconLayoutRows } from "@/components/Icons";

interface Props {
  ticker: string | null;
  run: AnalysisRun | undefined;
  settings: AppSettings | null;
  ready: boolean;
  readyReason: string | null;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
}

const DIRECTION_KEY = "stockanalyzer.dockDirection";

function readDirection(): SplitDirection {
  if (typeof localStorage === "undefined") return "vertical";
  const value = localStorage.getItem(DIRECTION_KEY);
  // 既定は縦並び（分析結果を上、対話を下）。長文の評価テーブルが読みやすい。
  return value === "horizontal" ? "horizontal" : "vertical";
}

/**
 * 下部ドック。分析結果と対話を、縦並び / 横並びを切り替えて配置する。
 * 各パネルは折りたたみでき、境界はドラッグでリサイズできる。
 */
export default function BottomDock({
  ticker,
  run,
  settings,
  ready,
  readyReason,
  onRun,
  onCancel,
  onClear,
  onOpenSettings,
}: Props) {
  const [direction, setDirection] = useState<SplitDirection>(readDirection);
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(DIRECTION_KEY, direction);
    } catch {
      // 保存できなくても動作は続ける
    }
  }, [direction]);

  const collapsed = analysisCollapsed ? "first" : chatCollapsed ? "second" : null;
  const isVertical = direction === "vertical";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 配置切替。パネルヘッダーの右上に重ねる */}
      <button
        type="button"
        onClick={() => setDirection(isVertical ? "horizontal" : "vertical")}
        title={isVertical ? "横並びに切り替える" : "縦並びに切り替える"}
        className="absolute right-2 top-1.5 z-10 rounded border border-slate-700 bg-slate-900 p-1 text-slate-400 hover:border-slate-600 hover:text-emerald-300"
      >
        {isVertical ? (
          <IconLayoutColumns className="h-3.5 w-3.5" />
        ) : (
          <IconLayoutRows className="h-3.5 w-3.5" />
        )}
      </button>

      <ResizableSplit
        direction={direction}
        collapsed={collapsed}
        // 縦並びのときは対話を低めに、横並びのときは半分ずつに近づける
        initialSecondSize={isVertical ? 220 : 460}
        minFirstSize={140}
        minSecondSize={140}
        first={
          <AnalysisPanel
            ticker={ticker}
            run={run}
            ready={ready}
            readyReason={readyReason}
            collapsed={analysisCollapsed}
            onToggleCollapse={() => {
              setAnalysisCollapsed((v) => !v);
              // 両方畳んだ状態にはしない
              if (!analysisCollapsed) setChatCollapsed(false);
            }}
            onRun={onRun}
            onCancel={onCancel}
            onClear={onClear}
            onOpenSettings={onOpenSettings}
          />
        }
        second={
          <div className={isVertical ? "h-full border-t border-slate-800" : "h-full border-l border-slate-800"}>
            <ChatPanel
              settings={settings}
              collapsed={chatCollapsed}
              onToggleCollapse={() => {
                setChatCollapsed((v) => !v);
                if (!chatCollapsed) setAnalysisCollapsed(false);
              }}
              onOpenSettings={onOpenSettings}
            />
          </div>
        }
      />
    </div>
  );
}
