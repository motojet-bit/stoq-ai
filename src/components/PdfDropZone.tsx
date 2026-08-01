import { useRef, useState, type DragEvent } from "react";
import { ACCEPT_ATTRIBUTE, SUPPORTED_EXTENSIONS } from "@/lib/parser/extractText";
import { IconUpload } from "@/components/Icons";

interface Props {
  /** 受け取ったファイルを取り込む */
  onFiles: (files: File[]) => void;
}

/**
 * 一次資料（PDF / DOCX / TXT など）のドロップゾーン。
 * ドラッグ＆ドロップとファイル選択ダイアログの両方に対応する。
 */
export default function PdfDropZone({ onFiles }: Props) {
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      title={`対応形式: ${SUPPORTED_EXTENSIONS.join(" / ")}`}
      className={`flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-[12px] transition-colors ${
        isOver
          ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
          : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
      }`}
    >
      <IconUpload className="h-4 w-4 shrink-0" />
      <span className="truncate">
        決算PDF・IR資料をドロップ
        <span className="ml-1.5 text-slate-600">（PDF / DOCX / TXT / MD / CSV / HTML）</span>
      </span>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
