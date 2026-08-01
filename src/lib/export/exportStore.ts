import { invoke, isTauri } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import type { AnalysisRecord } from "@/lib/export/analysisRecord";
import {
  exportFileName,
  renderExport,
  type ExportFormat,
} from "@/lib/export/exportAnalysis";

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
    toastError("エクスポートできません", "書き出す分析結果がありません。");
    return;
  }

  const contents = renderExport(records, format);
  const fileName = exportFileName(records, format, Date.now());

  if (!isTauri()) {
    toastError("エクスポートできません", "アプリ内でのみ利用できます。");
    return;
  }

  try {
    const path = await invoke<string>("export_write_file", { fileName, contents });
    toastSuccess("書き出しました", path);
  } catch (e) {
    toastError("書き出せませんでした", e);
  }
}
