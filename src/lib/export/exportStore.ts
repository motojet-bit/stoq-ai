import { invoke, isTauri } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import type { AnalysisRecord } from "@/lib/export/analysisRecord";
import {
  exportFileName,
  renderExport,
  type ExportFormat,
} from "@/lib/export/exportAnalysis";
import { buildPrintableHtml } from "@/lib/export/exportPdf";
import { t } from "@/lib/i18n/i18n";

/**
 * 分析結果をファイルへ書き出す。
 *
 * 書き出し先の決定と実際の書き込みは Rust 側（`exports.rs`）が行う。
 * WebView からはユーザーのフォルダへ書けないため。
 */
export async function exportRecords(
  records: AnalysisRecord[],
  format: ExportFormat,
): Promise<void> {
  if (records.length === 0) {
    toastError(t("toast.export.cannot"), t("toast.export.noData"));
    return;
  }

  /*
   * **PDF はファイルに書かず、印刷ダイアログへ回す。**
   * PDF 生成ライブラリを足すと、日本語の埋め込みフォントで数 MB 増える。
   * 「超軽量であること」を優先し、OS 側のフォントで描かせる。
   */
  if (format === "pdf") {
    printAsPdf(records);
    return;
  }

  const contents = renderExport(records, format);
  const fileName = exportFileName(records, format, Date.now());

  if (!isTauri()) {
    toastError(t("toast.export.cannot"), t("toast.export.appOnly"));
    return;
  }

  try {
    const path = await invoke<string>("export_write_file", { fileName, contents });
    toastSuccess(t("toast.export.done"), path);
  } catch (e) {
    toastError(t("toast.export.failed"), e);
  }
}

/** 印刷用の別ウィンドウを開く。閉じるのはユーザーに任せる（保存前に閉じない）。 */
function printAsPdf(records: AnalysisRecord[]): void {
  const win = window.open("", "_blank");
  if (!win) {
    toastError(t("export.pdf.blocked"), t("toast.export.appOnly"));
    return;
  }
  win.document.write(buildPrintableHtml(records));
  win.document.close();
  // 描画が終わってから印刷を呼ぶ（空白ページで開くのを防ぐ）
  win.onload = () => win.print();
  toastSuccess(t("toast.export.done"), t("export.pdf.opened"));
}
