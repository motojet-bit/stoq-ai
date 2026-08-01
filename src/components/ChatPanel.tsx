import { IconMessage } from "@/components/Icons";

/** 下部スプリット右側: 対話パネル（プレースホルダー） */
export default function ChatPanel() {
  return (
    <section className="flex h-full min-w-0 flex-col border-l border-slate-800">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-800 px-3 text-[12px] font-medium text-slate-400">
        <IconMessage className="h-3.5 w-3.5 text-slate-600" />
        対話
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="selectable text-[12px] leading-relaxed text-slate-600">
          銘柄や決算資料について質問すると、ここに会話が表示されます。
        </p>
      </div>

      <div className="shrink-0 border-t border-slate-800 p-2">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            disabled
            placeholder="Phase 2 で有効になります（例: この四半期の粗利率低下の要因は？）"
            className="selectable min-h-[38px] flex-1 resize-none rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            className="h-8 shrink-0 rounded-md bg-slate-800 px-3 text-[12px] text-slate-500"
          >
            送信
          </button>
        </div>
      </div>
    </section>
  );
}
