import type { AppSettings } from "@/types";
import TickerInput from "@/components/TickerInput";
import PdfDropZone from "@/components/PdfDropZone";
import AttachmentHint from "@/components/AttachmentHint";
import ProviderMenu from "@/components/ProviderMenu";
import QuoteTicker from "@/components/QuoteTicker";

interface Props {
  settings: AppSettings | null;
  onTickerSubmit: (ticker: string) => void;
  /** 表示中の銘柄。株価フィードの対象になる */
  activeTicker?: string | null;
  /** 検討中銘柄のクリックなどで入力欄にセットしたい値 */
  tickerPreset?: { ticker: string; seq: number } | null;
  onFiles: (files: File[]) => void;
  onOpenSettings: () => void;
}

/**
 * メニューバー直下の操作バー。
 * ティッカー入力 / 資料ドロップゾーン / APIキー状態 をまとめる。
 */
export default function CommandBar({
  settings,
  onTickerSubmit,
  activeTicker = null,
  tickerPreset = null,
  onFiles,
  onOpenSettings,
}: Props) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-3">
      <TickerInput onSubmit={onTickerSubmit} preset={tickerPreset} />

      {/* 入力欄のすぐ隣に置く。**今どの銘柄を見ているか**と対で読むもの */}
      <QuoteTicker ticker={activeTicker} />

      <div className="h-6 w-px bg-slate-800" />

      {/*
        ドロップ領域の右端に置く。**何を添付すべきかは落とす直前に効く**ので、
        設定やヘルプの奥ではなく、この場所に出す。
      */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PdfDropZone onFiles={onFiles} />
        <AttachmentHint />
      </div>

      <div className="h-6 w-px bg-slate-800" />

      {/* AI設定は文字サイズ連動から切り離す（太るとレイアウトが動くため） */}
      <div className="ui-fixed flex shrink-0 items-center">
        <ProviderMenu settings={settings} onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
