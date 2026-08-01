import { IconChart } from "@/components/Icons";

/** 下部スプリット左側: LLM による分析結果の表示枠（プレースホルダー） */
export default function AnalysisPanel() {
  return (
    <section className="flex h-full min-w-0 flex-col">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-800 px-3 text-[12px] font-medium text-slate-400">
        <IconChart className="h-3.5 w-3.5 text-slate-600" />
        分析結果
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2.5">
          <div className="h-2.5 w-4/5 rounded bg-slate-800" />
          <div className="h-2.5 w-full rounded bg-slate-800/70" />
          <div className="h-2.5 w-3/5 rounded bg-slate-800/70" />
          <div className="h-2.5 w-11/12 rounded bg-slate-800/50" />
        </div>
        <p className="selectable mt-4 text-[12px] leading-relaxed text-slate-600">
          LLM が生成したファンダメンタル分析（強み・リスク・バリュエーション所見）を
          ここに表示します。
        </p>
      </div>
    </section>
  );
}
