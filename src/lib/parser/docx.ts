import { unzipSync, strFromU8 } from "fflate";

/**
 * DOCX からテキストを抽出する。
 *
 * DOCX は ZIP アーカイブで、本文は `word/document.xml` に入っている。
 * 専用ライブラリを足さず、展開 + タグ除去で済ませる。
 */
export function extractDocxText(data: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(data));
  const entry = files["word/document.xml"];
  if (!entry) {
    throw new Error("DOCX の本文（word/document.xml）が見つかりませんでした。");
  }

  return xmlToText(strFromU8(entry));
}

/** Word の XML から可読テキストを取り出す。 */
function xmlToText(xml: string): string {
  return (
    xml
      // 段落・改行・タブを先に目印へ置換する
      .replace(/<w:p[ >]/g, "\n<w:p ")
      .replace(/<w:br\s*\/?>/g, "\n")
      .replace(/<w:tab\s*\/?>/g, "\t")
      // 残りのタグを除去
      .replace(/<[^>]+>/g, "")
      // 実体参照を復号
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      // 空行の連続を圧縮
      .split("\n")
      .map((line) => line.trim())
      .filter((line, i, arr) => line.length > 0 || arr[i - 1]?.length > 0)
      .join("\n")
      .trim()
  );
}
