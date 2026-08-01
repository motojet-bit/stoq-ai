import { unzipSync, strFromU8 } from "fflate";

/**
 * PPTX からテキストを抽出する。
 *
 * PPTX は ZIP アーカイブで、各スライドの本文は `ppt/slides/slideN.xml` の
 * `<a:t>` 要素に入っている。発表者ノート（`ppt/notesSlides/notesSlideN.xml`）は
 * 決算説明会資料で重要な補足を含むことが多いため、あわせて取り込む。
 */
export function extractPptxText(data: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(data));

  const slides = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slides.length === 0) {
    throw new Error("PPTX のスライド（ppt/slides/）が見つかりませんでした。");
  }

  const sections: string[] = [];

  for (const name of slides) {
    const no = slideNumber(name);
    const body = collectText(strFromU8(files[name]));
    const notesEntry = files[`ppt/notesSlides/notesSlide${no}.xml`];
    const notes = notesEntry ? collectText(strFromU8(notesEntry)) : "";

    if (!body && !notes) continue;

    let section = `--- Slide ${no} ---`;
    if (body) section += `\n${body}`;
    if (notes) section += `\n[発表者ノート] ${notes}`;
    sections.push(section);
  }

  return sections.join("\n\n");
}

function slideNumber(name: string): number {
  return Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

/** `<a:t>` の中身を順に連結する。段落 `<a:p>` の切れ目は改行にする。 */
function collectText(xml: string): string {
  const lines: string[] = [];

  for (const paragraph of xml.split("<a:p>")) {
    const parts: string[] = [];
    for (const m of paragraph.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)) {
      parts.push(decodeXml(m[1]));
    }
    const line = parts.join("").trim();
    if (line) lines.push(line);
  }

  return lines.join("\n");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
