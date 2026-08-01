import type { AppSettings, DroppedDocument } from "@/types";
import TickerInput from "@/components/TickerInput";
import ApiKeyIndicator from "@/components/ApiKeyIndicator";
import PdfDropZone from "@/components/PdfDropZone";

interface Props {
  settings: AppSettings | null;
  documents: DroppedDocument[];
  onTickerSubmit: (ticker: string) => void;
  onAddDocuments: (files: File[]) => void;
  onRemoveDocument: (id: string) => void;
  onOpenSettings: () => void;
}

/**
 * メニューバー直下の操作バー。
 * ティッカー入力 / APIキー状態 / PDFドロップゾーン をまとめる。
 */
export default function CommandBar({
  settings,
  documents,
  onTickerSubmit,
  onAddDocuments,
  onRemoveDocument,
  onOpenSettings,
}: Props) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-3">
      <TickerInput onSubmit={onTickerSubmit} />

      <div className="h-6 w-px bg-slate-800" />

      <PdfDropZone
        documents={documents}
        onAdd={onAddDocuments}
        onRemove={onRemoveDocument}
      />

      <div className="h-6 w-px bg-slate-800" />

      <ApiKeyIndicator settings={settings} onOpenSettings={onOpenSettings} />
    </div>
  );
}
