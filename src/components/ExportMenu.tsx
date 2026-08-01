import { useRef, useState } from "react";
import type { AnalysisRecord } from "@/lib/export/analysisRecord";
import { EXPORT_FORMATS } from "@/lib/export/exportAnalysis";
import { exportRecords } from "@/lib/export/exportStore";
import PortalMenu from "@/components/PortalMenu";
import { IconChevronDown, IconDownload } from "@/components/Icons";

interface Props {
  /** 書き出す対象。空なら押せない */
  records: () => AnalysisRecord[];
  /** ボタンに出す補足（件数など） */
  label?: string;
  disabled?: boolean;
}

/**
 * 分析結果のワンクリック書き出し。
 *
 * 形式は CSV / Markdown / JSON。どれも同じ `AnalysisRecord` から作るので、
 * **形式によって数字が食い違うことがない**。
 */
export default function ExportMenu({ records, label = "エクスポート", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const run = async (format: (typeof EXPORT_FORMATS)[number]["id"]) => {
    setOpen(false);
    setBusy(true);
    try {
      await exportRecords(records(), format);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-fixed shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title="CSV / Markdown / JSON で書き出す"
        className="flex min-h-6 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-1.5 text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconDownload className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="whitespace-nowrap">{busy ? "書き出し中…" : label}</span>
        <IconChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
      </button>

      <PortalMenu
        open={open}
        anchorRef={buttonRef}
        onClose={() => setOpen(false)}
        widthClass="w-72"
      >
        <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          書き出す形式
        </div>

        {EXPORT_FORMATS.map((format) => (
          <button
            key={format.id}
            type="button"
            role="menuitem"
            onClick={() => void run(format.id)}
            className="block w-full px-3 py-2 text-left text-slate-300 transition-colors hover:bg-slate-700"
          >
            <span className="block font-medium">{format.label}</span>
            <span className="block text-[11px] text-slate-500">.{format.extension}</span>
          </button>
        ))}

        <div className="my-1 border-t border-slate-700" />
        <p className="px-3 py-1 text-[11px] leading-relaxed text-slate-500">
          ダウンロードフォルダに保存します。
          同名のファイルがあれば連番を付けます。
        </p>
      </PortalMenu>
    </div>
  );
}
