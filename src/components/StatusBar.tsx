interface Props {
  ticker: string | null;
  documentCount: number;
}

/** 最下部のステータスバー */
export default function StatusBar({ ticker, documentCount }: Props) {
  return (
    <footer className="flex min-h-6 shrink-0 items-center gap-4 border-t border-slate-800 bg-slate-900 px-3 t-label text-slate-500">
      <span className="text-emerald-500">● 準備完了</span>
      <span>銘柄: {ticker ?? "—"}</span>
      <span>読み込み済み資料: {documentCount} 件</span>
      <span className="ml-auto font-mono">Phase 1 / v0.1.0</span>
    </footer>
  );
}
