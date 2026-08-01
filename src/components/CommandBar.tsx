import type { AppSettings } from "@/types";
import TickerInput from "@/components/TickerInput";
import PdfDropZone from "@/components/PdfDropZone";
import ProviderMenu from "@/components/ProviderMenu";
import FontSizeControl from "@/components/FontSizeControl";

interface Props {
  settings: AppSettings | null;
  onTickerSubmit: (ticker: string) => void;
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
  onFiles,
  onOpenSettings,
}: Props) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-3">
      <TickerInput onSubmit={onTickerSubmit} />

      <div className="h-6 w-px bg-slate-800" />

      <PdfDropZone onFiles={onFiles} />

      <div className="h-6 w-px bg-slate-800" />

      {/*
        右上のコントロール群は `.ui-fixed` で文字サイズ連動から切り離す。
        上の「AI設定」が太るとスライダーが下へずれ、ドラッグ中に
        カーソルから逃げてしまうため、まとめて固定する。
      */}
      <div className="ui-fixed flex shrink-0 flex-col items-end gap-1">
        <ProviderMenu settings={settings} onOpenSettings={onOpenSettings} />
        <FontSizeControl />
      </div>
    </div>
  );
}
