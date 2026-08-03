/**
 * 本文中の Markdown テーブルを取り出す。
 *
 * 対話へ転送した評価テーブルは、素のテキストのままだと
 * パイプ記号が並ぶだけで読めない。表として描くために構造へ戻す。
 */

export interface ParsedTable {
  header: string[];
  rows: string[][];
}

/** 本文の 1 ブロック。表かそれ以外か。 */
export type Block =
  | { kind: "text"; text: string }
  | { kind: "table"; table: ParsedTable };

const isSeparator = (line: string) => /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(line);
const isRow = (line: string) => line.trim().startsWith("|") && line.trim().endsWith("|");

/** `| a | b |` を `["a", "b"]` にする。 */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * 本文を「表」と「それ以外」に切り分ける。
 *
 * **表以外の文はそのまま残す。** 表だけ抜き出すと、
 * 前後の説明が消えて何の表か分からなくなる。
 */
export function splitBlocks(body: string): Block[] {
  const lines = body.split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];

  const flushText = () => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n");
    if (text.trim() !== "") blocks.push({ kind: "text", text });
    buffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    // ヘッダー行 + 区切り行 が続いていたら表の開始
    if (isRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const header = cells(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isRow(lines[i]) && !isSeparator(lines[i])) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      flushText();
      blocks.push({ kind: "table", table: { header, rows } });
      continue;
    }
    buffer.push(lines[i]);
    i += 1;
  }

  flushText();
  return blocks;
}

/** 本文に表が含まれるか。切り替えボタンを出すかの判断に使う。 */
export function hasTable(body: string): boolean {
  return splitBlocks(body).some((b) => b.kind === "table");
}
