import type { AnalysisRecord } from "@/lib/export/analysisRecord";
import { t } from "@/lib/i18n/i18n";

/**
 * 分析結果を PDF にする。
 *
 * **PDF 生成ライブラリを足さない。** 日本語を出すには埋め込みフォントが要り、
 * 数 MB のフォントをバイナリへ抱えることになる。
 * 「超軽量であること」を優先し、**印刷ダイアログの「PDF として保存」**に載せる。
 * OS 側のフォントで描かれるので、日本語も崩れない。
 */

/*
 * スタイルの意図（テンプレート内にコメントを書くと本文へ混ざるのでここに置く）:
 * - @page の余白は印刷側の既定に寄せる（画面ではなく紙に合わせる）
 * - tr に page-break-inside: avoid — 表が途中で切れると読めなくなる
 * - .record に page-break-after: always — 銘柄ごとにページを分ける
 */
/** 印刷用の HTML を組み立てる。 */
export function buildPrintableHtml(records: AnalysisRecord[]): string {
  const title =
    records.length === 1
      ? `${records[0].ticker} ${records[0].fiscalQuarter}`
      : t("export.compareName", { count: records.length });

  const sections = records.map(renderRecord).join("\n");

  return `<!doctype html>
<html lang="${t("export.pdf.lang")}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 16mm 14mm; }
  body {
    font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
    font-size: 10.5pt;
    line-height: 1.7;
    color: #111;
  }
  h1 { font-size: 16pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; margin: 18pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; }
  .meta { color: #666; font-size: 9pt; margin-bottom: 12pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
  th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  tr { page-break-inside: avoid; }
  ul { margin: 4pt 0; padding-left: 16pt; }
  .record { page-break-after: always; }
  .record:last-child { page-break-after: auto; }
  .disclaimer { margin-top: 18pt; padding-top: 8pt; border-top: 1px solid #ccc; color: #666; font-size: 8.5pt; }
</style>
</head>
<body>
${sections}
<p class="disclaimer">${escapeHtml(t("export.pdf.disclaimer"))}</p>
</body>
</html>`;
}

function renderRecord(record: AnalysisRecord): string {
  const blockRows = record.blockScores
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.label)}</td><td>${b.score === null ? "—" : b.score.toFixed(1)}</td></tr>`,
    )
    .join("");

  const metricRows = record.keyMetrics
    .map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.value)}</td></tr>`)
    .join("");

  const list = (items: string[]) =>
    items.length === 0
      ? `<p>${escapeHtml(t("common.none"))}</p>`
      : `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;

  return `<section class="record">
  <h1>${escapeHtml(record.ticker)} ${escapeHtml(record.fiscalQuarter)}</h1>
  <p class="meta">${escapeHtml(
    t("export.pdf.meta", {
      score: record.summary.averageScore === null ? "—" : record.summary.averageScore.toFixed(1),
      model: record.model ?? "—",
      date: new Date(record.savedAtMs).toLocaleString(),
    }),
  )}</p>

  <h2>${escapeHtml(t("history.blockScores"))}</h2>
  <table>
    <thead><tr><th>${escapeHtml(t("export.col.item"))}</th><th>${escapeHtml(
      t("export.col.score"),
    )}</th></tr></thead>
    <tbody>${blockRows}</tbody>
  </table>

  <h2>${escapeHtml(t("history.keyMetrics"))}</h2>
  <table>
    <thead><tr><th>${escapeHtml(t("export.col.item"))}</th><th>${escapeHtml(
      t("export.col.value"),
    )}</th></tr></thead>
    <tbody>${metricRows}</tbody>
  </table>

  <h2>${escapeHtml(t("analysis.strengths"))}</h2>
  ${list(record.evaluations.strengths)}
  <h2>${escapeHtml(t("analysis.risks"))}</h2>
  ${list(record.evaluations.risks)}

  <h2>${escapeHtml(t("export.pdf.rawHeading"))}</h2>
  <pre style="white-space: pre-wrap; font-family: inherit; font-size: 9.5pt;">${escapeHtml(
    record.rawMarkdownOutput,
  )}</pre>
</section>`;
}

/** HTML に流し込む前に必ず通す。分析文には `<` も `&` も普通に出てくる。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
