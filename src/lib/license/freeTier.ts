/**
 * 無料版の利用制限。
 *
 * **「分析した銘柄数」で数える。** 実行回数で数えると、同じ銘柄を
 * 決算のたびに見直す使い方が制限に引っかかってしまい、
 * このアプリの本来の価値（決算期をまたいだ追跡）が損なわれるため。
 *
 * すでに使った銘柄は何度でも再分析・対話・過去ログ閲覧ができる。
 */

/** 無料版で分析できる銘柄数 */
export const FREE_TICKER_LIMIT = 3;

export interface AccessInput {
  /** ライセンスが有効か */
  activated: boolean;
  /** これまでに分析した銘柄（大文字） */
  usedTickers: string[];
  /** これから分析しようとしている銘柄 */
  ticker: string;
}

export interface AccessResult {
  allowed: boolean;
  /** 未使用の銘柄か（新しく枠を消費するか） */
  isNew: boolean;
  /** 残り枠。ライセンス有効なら null（無制限） */
  remaining: number | null;
  /** 制限に達したか（ダイアログを出す条件） */
  limitReached: boolean;
}

/** 表記ゆれを吸収する。 */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/** 重複を除いた使用済み銘柄。 */
export function uniqueTickers(tickers: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tickers) {
    const ticker = normalizeTicker(raw);
    if (ticker === "" || seen.has(ticker)) continue;
    seen.add(ticker);
    result.push(ticker);
  }
  return result;
}

/**
 * その銘柄を分析してよいか判定する。
 *
 * - ライセンスが有効 → 常に許可
 * - すでに使った銘柄 → 許可（再分析は無制限）
 * - 未使用で枠が残っている → 許可
 * - 未使用で枠が尽きた → 拒否
 */
export function evaluateAccess({
  activated,
  usedTickers,
  ticker,
}: AccessInput): AccessResult {
  const used = uniqueTickers(usedTickers);
  const target = normalizeTicker(ticker);
  const isNew = target !== "" && !used.includes(target);

  if (activated) {
    return { allowed: true, isNew, remaining: null, limitReached: false };
  }

  const remaining = Math.max(FREE_TICKER_LIMIT - used.length, 0);

  // すでに使った銘柄なら、枠が尽きていても通す
  if (!isNew) {
    return { allowed: true, isNew: false, remaining, limitReached: false };
  }

  const allowed = remaining > 0;
  return { allowed, isNew: true, remaining, limitReached: !allowed };
}

/**
 * 使用済みに登録する。
 *
 * **上限を超えて積まない。** 制限中に何度も押されたぶんまで記録すると、
 * ライセンス解除後に「使った覚えのない銘柄」が並んでしまう。
 */
export function registerTicker(usedTickers: string[], ticker: string): string[] {
  const used = uniqueTickers(usedTickers);
  const target = normalizeTicker(ticker);
  if (target === "" || used.includes(target)) return used;
  if (used.length >= FREE_TICKER_LIMIT) return used;
  return [...used, target];
}

/** 残り枠の案内文。 */
export function remainingLabel(result: AccessResult): string {
  if (result.remaining === null) return "";
  if (result.remaining === 0) return "無料版の分析枠を使い切りました";
  return `無料版であと ${result.remaining} 銘柄を分析できます`;
}
