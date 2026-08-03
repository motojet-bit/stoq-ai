/**
 * 決算資料のテキストから「どの年度・第何四半期のものか」を割り出す。
 *
 * **先頭寄りの記載を信じる。** 決算資料は表紙や見出しに対象期を書き、
 * 本文では前年同期や過去実績にも触れる。文書全体から拾うと、
 * 比較対象として出てくる古い期を掴んでしまう。
 */

/** 割り出した決算期。 */
export interface FiscalPeriod {
  /** 会計年度（西暦 4 桁）。例: 2023 */
  fiscalYear: number;
  /** 第何四半期か。通期なら null */
  quarter: 1 | 2 | 3 | 4 | null;
  /** `FY2023-Q3` 形式。ヒートマップ等の突き合わせに使う内部キー */
  key: string;
  /** どの書き方から拾ったか（診断用） */
  matchedBy:
    | "usQuarter"
    | "jpQuarter"
    | "jpFiscalYear"
    | "usFiscalYear"
    | "fileName"
    /** どこからも読み取れず、暦から見積もった値 */
    | "estimated";
  /** 拾った元の文字列 */
  matchedText: string;
}

/**
 * 判定に使う本文の長さ。
 *
 * 表紙 + 目次 + サマリーで足りる。長く取るほど、
 * 本文中の前年同期の記載に引っ張られる。
 */
const HEAD_CHARS = 4000;

interface Rule {
  matchedBy: FiscalPeriod["matchedBy"];
  pattern: RegExp;
  read: (m: RegExpMatchArray) => { year: number; quarter: 1 | 2 | 3 | 4 | null } | null;
}

const toQuarter = (value: string): 1 | 2 | 3 | 4 | null => {
  const n = Number(value);
  return n >= 1 && n <= 4 ? (n as 1 | 2 | 3 | 4) : null;
};

/** 2 桁年は 2000 年代として読む（決算資料に 19xx は出てこない）。 */
const toYear = (value: string): number => {
  const n = Number(value);
  return n < 100 ? 2000 + n : n;
};

/*
 * 並び順が優先順位。**四半期まで分かる書き方を先に試す。**
 * 年度だけの記載を先に当てると、Q が読めるはずの資料でも通期扱いになる。
 */
const RULES: Rule[] = [
  {
    // FY2023 Q3 / FY23Q3 / fiscal 2023 third quarter
    matchedBy: "usQuarter",
    pattern: /\bFY\s*'?(\d{2,4})\s*[-\/ ]?\s*Q([1-4])\b/i,
    read: (m) => ({ year: toYear(m[1]), quarter: toQuarter(m[2]) }),
  },
  {
    // Q3 FY2023 / Q3 FY23
    matchedBy: "usQuarter",
    pattern: /\bQ([1-4])\s*[-\/ ]?\s*FY\s*'?(\d{2,4})\b/i,
    read: (m) => ({ year: toYear(m[2]), quarter: toQuarter(m[1]) }),
  },
  {
    // 2023年12月期 第3四半期 / 2023年3月期第2四半期
    matchedBy: "jpQuarter",
    pattern: /(\d{4})\s*年\s*\d{1,2}\s*月期\s*第\s*([1-4１-４])\s*四半期/,
    read: (m) => ({ year: toYear(m[1]), quarter: toQuarter(toHalfWidth(m[2])) }),
  },
  {
    // 2023年度 第3四半期
    matchedBy: "jpQuarter",
    pattern: /(\d{4})\s*年度\s*第\s*([1-4１-４])\s*四半期/,
    read: (m) => ({ year: toYear(m[1]), quarter: toQuarter(toHalfWidth(m[2])) }),
  },
  {
    // third quarter of fiscal 2023 / third quarter fiscal year 2023
    matchedBy: "usQuarter",
    pattern:
      /\b(first|second|third|fourth)\s+quarter\b[^.\n]{0,40}?\bfiscal(?:\s+year)?\s+(\d{4})\b/i,
    read: (m) => ({ year: toYear(m[2]), quarter: ORDINALS[m[1].toLowerCase()] ?? null }),
  },
  {
    // 2023年12月期（通期）
    matchedBy: "jpFiscalYear",
    pattern: /(\d{4})\s*年\s*\d{1,2}\s*月期/,
    read: (m) => ({ year: toYear(m[1]), quarter: null }),
  },
  {
    // FY2023 / fiscal year 2023（通期）
    matchedBy: "usFiscalYear",
    pattern: /\b(?:FY\s*'?|fiscal\s+year\s+)(\d{2,4})\b/i,
    read: (m) => ({ year: toYear(m[1]), quarter: null }),
  },
];

const ORDINALS: Record<string, 1 | 2 | 3 | 4> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
};

/** 全角数字を半角へ。日本語の決算資料は「第３四半期」と書くことがある。 */
function toHalfWidth(value: string): string {
  return value.replace(/[１-４]/g, (c) => String(c.charCodeAt(0) - 0xff10));
}

/** `FY2023-Q3` / 通期なら `FY2023` を返す。 */
export function periodKey(fiscalYear: number, quarter: 1 | 2 | 3 | 4 | null): string {
  return quarter === null ? `FY${fiscalYear}` : `FY${fiscalYear}-Q${quarter}`;
}

/**
 * テキストから決算期を割り出す。判別できなければ null。
 *
 * **推測しない。** 分からないまま「たぶん直近の四半期」を返すと、
 * 別の期の株価と突き合わせた分析が、正しそうな顔で出てくる。
 */
export function detectFiscalPeriod(text: string): FiscalPeriod | null {
  const head = text.slice(0, HEAD_CHARS);

  for (const rule of RULES) {
    const m = head.match(rule.pattern);
    if (!m) continue;
    const read = rule.read(m);
    if (!read || !Number.isFinite(read.year)) continue;
    // 4 桁になっていない・現実的でない年は捨てる（ページ番号や型番の誤検出）
    if (read.year < 1990 || read.year > 2100) continue;

    return {
      fiscalYear: read.year,
      quarter: read.quarter,
      key: periodKey(read.year, read.quarter),
      matchedBy: rule.matchedBy,
      matchedText: m[0].trim(),
    };
  }
  return null;
}

/**
 * ファイル名から決算期を読み取る。
 *
 * **本文の解析に失敗したときの最後の手がかり。**
 * 画像だけの PDF や、表紙に期を書かない資料でも、
 * `FY26_Q3.pdf` `2024年3月期_Q1.pdf` のような名前が付いていることは多い。
 *
 * 本文と同じ規則で読むが、**区切り文字が多い**ので先に空白へ均す。
 */
export function detectFiscalPeriodFromName(fileName: string): FiscalPeriod | null {
  // 拡張子を落とし、_ - . を空白にして本文と同じ規則に乗せる
  const base = fileName.replace(/\.[A-Za-z0-9]+$/, "").replace(/[._\-]+/g, " ");
  const found = detectFiscalPeriod(base);
  if (!found) return null;
  return { ...found, matchedBy: "fileName", matchedText: found.matchedText };
}

/**
 * 複数の資料から期を読み取り、**種類ごとにまとめる。**
 *
 * 期の違う資料を混ぜて 1 回で分析すると、
 * どの数字がどの期のものか分からない結果ができる。
 * 2 種類以上見つかったら、呼び出し側でユーザーに 1 つ選ばせる。
 */
export function collectFiscalPeriods(
  documents: { name: string; text: string }[],
): { period: FiscalPeriod; documents: string[] }[] {
  const byKey = new Map<string, { period: FiscalPeriod; documents: string[] }>();

  for (const doc of documents) {
    // 本文で読めなければファイル名。どちらも駄目なら「期不明」として束ねない
    const found = detectFiscalPeriod(doc.text) ?? detectFiscalPeriodFromName(doc.name);
    if (!found) continue;
    const entry = byKey.get(found.key);
    if (entry) entry.documents.push(doc.name);
    else byKey.set(found.key, { period: found, documents: [doc.name] });
  }

  // 新しい期が先（直近を既定に選びやすい並び）
  return [...byKey.values()].sort((a, b) => periodOrder(b.period) - periodOrder(a.period));
}

/** 並べ替え用の数値。通期は Q4 の後ろに置く。 */
function periodOrder(period: FiscalPeriod): number {
  return period.fiscalYear * 10 + (period.quarter ?? 5);
}

/**
 * SEC でその時点までに提出されていそうな最新期を見積もる。
 *
 * **期が全く分からないときの初期値にだけ使う。**
 * 四半期報告は期末から 40〜45 日ほど遅れて出るので、
 * 「いまの月」ではなく **1 四半期前**を既定にする。
 * 8 月なら Q2（4〜6 月期）が直近の提出分。
 */
export function likelyLatestPeriod(now: Date): FiscalPeriod {
  const month = now.getMonth() + 1;
  const currentQuarter = Math.floor((month - 1) / 3) + 1;

  // 1 つ前の四半期。年初なら前年の Q4 へ戻す
  const quarter = currentQuarter === 1 ? 4 : ((currentQuarter - 1) as 1 | 2 | 3 | 4);
  const year = currentQuarter === 1 ? now.getFullYear() - 1 : now.getFullYear();

  return {
    fiscalYear: year,
    quarter,
    key: periodKey(year, quarter),
    matchedBy: "estimated",
    matchedText: "",
  };
}

/**
 * 決算期に対応する四半期を、Yahoo Finance の四半期系列から探す。
 *
 * **見つからなくてもエラーにしない。** 過去の四半期は 4〜8 期しか返ってこないので、
 * 古い決算 PDF を読ませたときは高い確率で外れる。
 * 外れたら PDF 単体で分析を続ける（`null` を返す）。
 */
export function matchQuarter<T extends { label: string; endDate: string }>(
  period: FiscalPeriod,
  quarters: T[],
): T | null {
  if (period.quarter === null) return null;

  for (const q of quarters) {
    // ラベル側（例: "3Q2023" / "FY23-Q3"）で当てる
    const label = q.label.toUpperCase().replace(/\s+/g, "");
    const yearTail = String(period.fiscalYear).slice(-2);
    const patterns = [
      `${period.quarter}Q${period.fiscalYear}`,
      `Q${period.quarter}${period.fiscalYear}`,
      `FY${yearTail}-Q${period.quarter}`,
      `FY${period.fiscalYear}-Q${period.quarter}`,
    ];
    if (patterns.some((p) => label === p)) return q;

    // 期末日側で当てる（ラベルの書式は取得元で揺れる）
    const year = Number(q.endDate.slice(0, 4));
    const month = Number(q.endDate.slice(5, 7));
    if (Number.isFinite(year) && Number.isFinite(month)) {
      if (year === period.fiscalYear && quarterOfMonth(month) === period.quarter) return q;
    }
  }
  return null;
}

/** 暦月から四半期を出す（1-3 月 = Q1 の暦年基準）。 */
function quarterOfMonth(month: number): 1 | 2 | 3 | 4 | null {
  if (month >= 1 && month <= 3) return 1;
  if (month >= 4 && month <= 6) return 2;
  if (month >= 7 && month <= 9) return 3;
  if (month >= 10 && month <= 12) return 4;
  return null;
}
