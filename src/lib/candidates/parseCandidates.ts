/**
 * 「ティッカー|社名|ジャンル」形式のテキストを解析する。
 *
 * スクリーナーやメモから貼り付けたテキストをそのまま受け取れるように、
 * 表記ゆれを吸収する:
 *
 * - 全角パイプ `｜` と半角 `|` の両方を区切りとして扱う
 * - 全角スペースを含む前後の空白を落とす
 * - 空行と `#` で始まる行（メモ書き）は無視する
 * - ティッカーは大文字に揃える
 *
 * 取り込めなかった行は捨てずに `errors` として返す。
 * **黙って落とすと「貼ったのに入っていない」に気づけないため。**
 */

export interface ParsedCandidate {
  ticker: string;
  name: string;
  genre: string;
}

export interface CandidateParseError {
  /** 1 始まりの行番号 */
  line: number;
  text: string;
  reason: string;
}

export interface CandidateParseResult {
  items: ParsedCandidate[];
  errors: CandidateParseError[];
  /** 同じ貼り付け内で重複していたティッカー（後の行を採用した） */
  duplicates: string[];
}

/** ティッカーとして許す文字。`BRK.B` `7203.T` `RDS-A` `^GSPC` を通す。 */
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.\-^]{0,15}$/;

/** 前後の空白（全角スペース含む）を落とす。 */
function trim(value: string): string {
  return value.replace(/^[\s　]+|[\s　]+$/g, "");
}

export function parseCandidates(input: string): CandidateParseResult {
  const items: ParsedCandidate[] = [];
  const errors: CandidateParseError[] = [];
  const duplicates: string[] = [];
  // 同じ貼り付け内の重複を後勝ちにするため、位置を覚えておく
  const indexByTicker = new Map<string, number>();

  input.split(/\r?\n/).forEach((rawLine, i) => {
    const line = trim(rawLine);
    if (line === "" || line.startsWith("#")) return;

    const fields = line.split(/[|｜]/).map(trim);
    if (fields.length > 3) {
      errors.push({
        line: i + 1,
        text: line,
        reason: "項目が多すぎます（ティッカー|社名|ジャンル の 3 つまで）",
      });
      return;
    }

    const ticker = (fields[0] ?? "").toUpperCase();
    if (ticker === "") {
      errors.push({ line: i + 1, text: line, reason: "ティッカーが空です" });
      return;
    }
    if (!TICKER_PATTERN.test(ticker)) {
      errors.push({
        line: i + 1,
        text: line,
        reason: `ティッカーとして扱えません: ${ticker}`,
      });
      return;
    }

    const candidate: ParsedCandidate = {
      ticker,
      name: fields[1] ?? "",
      genre: fields[2] ?? "",
    };

    const existing = indexByTicker.get(ticker);
    if (existing === undefined) {
      indexByTicker.set(ticker, items.length);
      items.push(candidate);
    } else {
      // 後から書いたほうが新しい情報とみなす
      items[existing] = candidate;
      if (!duplicates.includes(ticker)) duplicates.push(ticker);
    }
  });

  return { items, errors, duplicates };
}
