import { extractDocxText } from "@/lib/parser/docx";
import { extractPptxText } from "@/lib/parser/pptx";
import { t } from "@/lib/i18n/i18n";

/** 取り込めるファイルの拡張子。ファイル選択ダイアログの accept にも使う。 */
export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".md",
  ".csv",
  ".htm",
  ".html",
  ".json",
] as const;

export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.join(",");

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export function isSupported(name: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/**
 * ファイルからテキストを抽出する。すべてローカルで完結する。
 *
 * 対応していない拡張子や、抽出結果が空だった場合は Error を投げる。
 */
export async function extractText(file: File): Promise<string> {
  const ext = extensionOf(file.name);

  const text = await (async () => {
    switch (ext) {
      case ".pdf": {
        // pdfjs は 1MB 超あるため、PDF が実際に来たときだけ読み込む
        const { extractPdfText } = await import("@/lib/parser/pdf");
        return extractPdfText(await file.arrayBuffer());
      }
      case ".docx":
        return extractDocxText(await file.arrayBuffer());
      case ".pptx":
        return extractPptxText(await file.arrayBuffer());
      case ".htm":
      case ".html":
        return htmlToText(await file.text());
      case ".txt":
      case ".md":
      case ".csv":
      case ".json":
        return file.text();
      default:
        throw new Error(
          t("parser.unsupported", {
        name: file.name,
        formats: SUPPORTED_EXTENSIONS.join(" / "),
      }),
        );
    }
  })();

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(
      t("parser.noText", { name: file.name }),
    );
  }
  return trimmed;
}

/** HTML を素朴にテキスト化する（IR ページの保存版などを想定）。 */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return (doc.body?.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}
