import * as pdfjs from "pdfjs-dist";
// Vite にワーカーをバンドルさせる。CDN を参照しないのでオフラインでも動く。
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** テキストアイテムかどうか（マーク付きコンテンツを除外する） */
function isTextItem(item: unknown): item is { str: string; hasEOL: boolean } {
  return typeof item === "object" && item !== null && "str" in item;
}

/**
 * PDF からテキストを抽出する。
 *
 * 抽出はすべてローカル（WebView 内）で完結し、ファイルは外部に送信されない。
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  // pdfjs-dist v6 では destroy() はドキュメントではなくローディングタスク側にある
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    // フォント取得のための外部アクセスを避ける
    disableFontFace: true,
  });
  const doc = await task.promise;

  try {
    const pages: string[] = [];

    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();

      let text = "";
      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        text += item.str;
        if (item.hasEOL) text += "\n";
      }
      page.cleanup();

      const trimmed = text.trim();
      if (trimmed) pages.push(`--- p.${pageNo} ---\n${trimmed}`);
    }

    return pages.join("\n\n");
  } finally {
    await task.destroy();
  }
}
