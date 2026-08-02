import { t } from "@/lib/i18n/i18n";
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
 * - **パイプが無い行はティッカーだけの羅列として扱う**（社名・ジャンルは空）。
 *   `AAPL` の改行羅列でも、`AAPL, NVDA` のようなカンマ・タブ区切りでも通る
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

  /** 1 銘柄を登録する。同じティッカーは後勝ちでまとめる。 */
  function push(line: number, text: string, raw: string, name: string, genre: string) {
    const ticker = raw.toUpperCase();
    if (ticker === "") {
      errors.push({ line, text, reason: t("parse.tickerEmpty") });
      return;
    }
    if (!TICKER_PATTERN.test(ticker)) {
      errors.push({ line, text, reason: t("parse.tickerInvalid", { ticker }) });
      return;
    }

    const candidate: ParsedCandidate = { ticker, name, genre };
    const existing = indexByTicker.get(ticker);
    if (existing === undefined) {
      indexByTicker.set(ticker, items.length);
      items.push(candidate);
    } else {
      // 後から書いたほうが新しい情報とみなす
      items[existing] = candidate;
      if (!duplicates.includes(ticker)) duplicates.push(ticker);
    }
  }

  input.split(/\r?\n/).forEach((rawLine, i) => {
    const line = trim(rawLine);
    if (line === "" || line.startsWith("#")) return;

    // パイプが無い行は「ティッカーだけの羅列」とみなす。
    // カンマ・読点・タブ区切りにも対応する（貼り付け元がまちまちなため）。
    if (!/[|｜]/.test(line)) {
      for (const token of line.split(/[,、\t]+/).map(trim).filter((t) => t !== "")) {
        push(i + 1, line, token, "", "");
      }
      return;
    }

    const fields = line.split(/[|｜]/).map(trim);
    if (fields.length > 3) {
      errors.push({
        line: i + 1,
        text: line,
        reason: t("parse.tooManyFields"),
      });
      return;
    }

    push(i + 1, line, fields[0] ?? "", fields[1] ?? "", fields[2] ?? "");
  });

  return { items, errors, duplicates };
}
