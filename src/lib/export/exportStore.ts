import { invoke, isTauri } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import type { AnalysisRecord } from "@/lib/export/analysisRecord";
import {
  exportFileName,
  renderExport,
  type ExportFormat,
} from "@/lib/export/exportAnalysis";
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
