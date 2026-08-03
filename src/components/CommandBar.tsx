import type { AppSettings } from "@/types";
import TickerInput from "@/components/TickerInput";
import PdfDropZone from "@/components/PdfDropZone";
import AttachmentHint from "@/components/AttachmentHint";
import ProviderMenu from "@/components/ProviderMenu";

interface Props {
  settings: AppSettings | null;
  onTickerSubmit: (ticker: string) => void;
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
  tickerPreset = null,
  onFiles,
  onOpenSettings,
}: Props) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-3">
      <TickerInput onSubmit={onTickerSubmit} preset={tickerPreset} />

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
