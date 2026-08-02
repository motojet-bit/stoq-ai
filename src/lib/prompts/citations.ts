/**
 * 分析本文から【参照: …】を拾い出す。
 *
 * **拾えることに意味がある。** 参照を必ず付けよとプロンプトで指示しても、
 * 守られたかどうかを機械的に確かめられなければ、守られていない出力に気づけない。
 * 画面ではこれを使って「根拠が付いている数値／付いていない数値」を見分ける。
 */

/** 参照 1 件。 */
export interface Citation {
  /** ページ番号。判別できなければ null（プロンプト上は `p.?`） */
  page: number | null;
  /** 原文の引用。ページ表記だけで引用が無ければ空文字 */
  quote: string;
  /** 資料の種別。ページ番号が無いものは出所名がそのまま入る */
  source: string;
  /** 元の【参照: …】全体 */
  raw: string;
}

/*
 * 【参照: p.12 "..."】/【参照: p.? "..."】/【参照: 財務指標】 のいずれにも当たる。
 * 引用符は半角・全角の両方を許す（日本語資料だと全角で返ってくることがある）。
 */
const CITATION = /【参照:\s*([^】]+)】/g;
const PAGE = /^p\.\s*(\d+|\?)\s*(.*)$/i;

/** 引用を囲う記号。前後どちらの向きでも落とす。 */
const QUOTE_CHARS = ['"', "'", "“", "”", "‘", "’", "「", "」"];

function unquote(value: string): string {
  let text = value.trim();
  while (text.length > 0 && QUOTE_CHARS.includes(text[0])) text = text.slice(1);
  while (text.length > 0 && QUOTE_CHARS.includes(text[text.length - 1])) text = text.slice(0, -1);
  return text.trim();
}

/** 本文から参照をすべて拾う。出現順を保つ。 */
export function extractCitations(body: string): Citation[] {
  const found: Citation[] = [];
  for (const match of body.matchAll(CITATION)) {
    const inner = match[1].trim();
    const page = inner.match(PAGE);

    if (page) {
      found.push({
        page: page[1] === "?" ? null : Number(page[1]),
        quote: unquote(page[2]),
        source: "pdf",
        raw: match[0],
      });
    } else {
      found.push({ page: null, quote: "", source: inner, raw: match[0] });
    }
  }
  return found;
}

/**
 * 同じ参照をまとめる。
 *
 * 同じ一文を 3 つの項目の根拠に使うことは普通にあるので、
 * 一覧に並べるときは重複を畳まないと読めない。
 */
export function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = `${c.source}|${c.page ?? "?"}|${c.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 参照の付き方の要約。画面のバッジに使う。 */
export interface CitationSummary {
  total: number;
  /** 添付資料（ページ付き）から引いたもの */
  fromDocuments: number;
  /** ページ番号を書けなかったもの。多いと資料の読み取りが怪しい */
  missingPage: number;
  /** ページはあるのに引用が空のもの。**原文で裏を取れていない** */
  missingQuote: number;
}

export function summarizeCitations(citations: Citation[]): CitationSummary {
  const pdf = citations.filter((c) => c.source === "pdf");
  return {
    total: citations.length,
    fromDocuments: pdf.length,
    missingPage: pdf.filter((c) => c.page === null).length,
    missingQuote: pdf.filter((c) => c.quote === "").length,
  };
}
