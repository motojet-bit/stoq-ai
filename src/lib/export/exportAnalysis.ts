import type { AnalysisRecord } from "@/lib/export/analysisRecord";

/**
 * 分析結果の書き出し。
 *
 * **どの形式でも同じ `AnalysisRecord` から作る。**
 * 画面ごとに組み立て直すと、CSV と JSON で数字が食い違う事故が起きる。
 */

export type ExportFormat = "csv" | "md" | "json";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; extension: string }[] = [
  { id: "csv", label: "CSV（表計算ソフト用）", extension: "csv" },
  { id: "md", label: "Markdown（レポート）", extension: "md" },
  { id: "json", label: "JSON（他ツール連携・AI再読込）", extension: "json" },
];

// ---------------------------------------------------------------- CSV

/**
 * CSV の 1 セルを安全な形にする。
 *
 * **カンマ・改行・引用符が入ると表がずれる。** 日本語の分析文には
 * 読点や改行が普通に入るので、必ず引用符で包んでエスケープする。
 */
export function escapeCsv(value: string): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** 行を CSV の 1 行にする。 */
export function csvRow(cells: string[]): string {
  return cells.map(escapeCsv).join(",");
}

/**
 * 複数銘柄を 1 枚の表にする。
 *
 * 列は**全レコードの和集合**で作る。銘柄によって取れる指標が違うため、
 * 1 件目だけを見て列を決めると他の銘柄の値が落ちる。
 */
export function toCsv(records: AnalysisRecord[]): string {
  if (records.length === 0) return "";

  const metricKeys: string[] = [];
  const metricLabels = new Map<string, string>();
  for (const record of records) {
    for (const m of record.keyMetrics) {
      if (!metricLabels.has(m.key)) {
        metricKeys.push(m.key);
        metricLabels.set(m.key, m.label);
      }
    }
  }

  const blockIds: string[] = [];
  const blockLabels = new Map<string, string>();
  for (const record of records) {
    for (const b of record.blockScores) {
      if (!blockLabels.has(b.id)) {
        blockIds.push(b.id);
        blockLabels.set(b.id, b.label);
      }
    }
  }

  const header = [
    "ティッカー",
    "銘柄名",
    "決算期",
    "総合スコア(100点)",
    "総合ステータス",
    "平均スコア(5点)",
    ...blockIds.map((id) => `${blockLabels.get(id)}(5点)`),
    ...metricKeys.map((key) => metricLabels.get(key) ?? key),
    ...Array.from({ length: 5 }, (_, i) => `強み${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `リスク${i + 1}`),
    "分析日時",
    "モデル",
  ];

  const rows = records.map((record) => {
    const metrics = new Map(record.keyMetrics.map((m) => [m.key, m.value]));
    const blocks = new Map(record.blockScores.map((b) => [b.id, b.score]));

    return csvRow([
      record.ticker,
      record.companyName,
      record.fiscalQuarter,
      record.summary.totalScore === null ? "" : String(record.summary.totalScore),
      `${record.summary.statusIcon} ${record.summary.statusLabel}`,
      record.summary.averageScore === null ? "" : String(record.summary.averageScore),
      ...blockIds.map((id) => {
        const score = blocks.get(id);
        return score === null || score === undefined ? "" : String(score);
      }),
      ...metricKeys.map((key) => metrics.get(key) ?? ""),
      ...Array.from({ length: 5 }, (_, i) => record.evaluations.strengths[i] ?? ""),
      ...Array.from({ length: 5 }, (_, i) => record.evaluations.risks[i] ?? ""),
      record.savedAtMs > 0 ? new Date(record.savedAtMs).toISOString() : "",
      record.model ?? "",
    ]);
  });

  // Excel が UTF-8 と判別できるよう BOM を付ける
  return `﻿${csvRow(header)}\n${rows.join("\n")}\n`;
}

// ---------------------------------------------------------------- Markdown

/** レポート形式の Markdown にする。 */
export function toMarkdown(records: AnalysisRecord[]): string {
  return records.map(markdownFor).join("\n\n---\n\n");
}

function markdownFor(record: AnalysisRecord): string {
  const title = record.companyName
    ? `${record.ticker} — ${record.companyName}`
    : record.ticker;

  const metrics = record.keyMetrics
    .map((m) => `| ${m.label} | ${m.value} |`)
    .join("\n");

  const blocks = record.blockScores
    .map((b) => `| ${b.label} | ${b.score === null ? "—" : b.score.toFixed(1)} / 5 |`)
    .join("\n");

  const bullets = (items: string[]) =>
    items.length === 0 ? "- （該当なし）" : items.map((i) => `- ${i}`).join("\n");

  return `# ${title}（${record.fiscalQuarter}）

**総合スコア: ${record.summary.totalScore ?? "—"} / 100　${record.summary.statusIcon} ${record.summary.statusLabel}**

分析日時: ${record.savedAtMs > 0 ? new Date(record.savedAtMs).toLocaleString("ja-JP") : "—"}${
    record.model ? ` ／ モデル: ${record.model}` : ""
  }

## ブロック別スコア

| ブロック | スコア |
| --- | --- |
${blocks}

## 主要指標

| 指標 | 値 |
| --- | --- |
${metrics}

## 適合・強み

${bullets(record.evaluations.strengths)}

## 基準未達・リスク

${bullets(record.evaluations.risks)}

## 生成テキスト（全文）

${record.rawMarkdownOutput}

---

> 本レポートは情報提供のみを目的としており、投資助言ではありません。
> AI の生成物には誤りが含まれる可能性があります。投資判断は自己責任で行ってください。`;
}

// ---------------------------------------------------------------- JSON

/** 他ツール連携・AI 再読み込み用の構造化データ。 */
export function toJson(records: AnalysisRecord[]): string {
  return JSON.stringify(
    {
      schema: "stoq-analysis/v1",
      exportedAtMs: 0,
      count: records.length,
      records,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------- 共通

/** 形式に応じた本文を作る。 */
export function renderExport(records: AnalysisRecord[], format: ExportFormat): string {
  switch (format) {
    case "csv":
      return toCsv(records);
    case "md":
      return toMarkdown(records);
    case "json":
      return toJson(records);
  }
}

/**
 * 保存するファイル名を作る。
 *
 * OS が受け付けない文字を落とし、**銘柄と決算期が一目で分かる**名前にする。
 */
export function exportFileName(
  records: AnalysisRecord[],
  format: ExportFormat,
  stampMs: number,
): string {
  const extension = EXPORT_FORMATS.find((f) => f.id === format)?.extension ?? format;
  const date = new Date(stampMs);
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");

  const base =
    records.length === 0
      ? "stoq-analysis"
      : records.length === 1
        ? `${records[0].ticker}_${records[0].fiscalQuarter}`
        : `stoq-compare_${records.length}銘柄`;

  return `${sanitizeFileName(base)}_${stamp}.${extension}`;
}

/** ファイル名に使えない文字を `_` に置き換える。 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 80);
}
