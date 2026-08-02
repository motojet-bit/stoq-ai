/**
 * 無料体験の利用制限。
 *
 * 制限は 2 本立て。
 * 1. **銘柄数**（10 銘柄まで）— 「分析した銘柄数」で数える。実行回数で数えると、
 *    同じ銘柄を決算のたびに見直す使い方が引っかかり、このアプリ本来の価値
 *    （決算期をまたいだ追跡）が損なわれるため。
 * 2. **期間**（初回起動から 21 日）— 起点は初回起動日。分析の有無に関わらず
 *    期限が一意に決まる。
 *
 * **どちらに引っかかっても、既存データの閲覧・再分析は止めない。**
 * 止めるのは「新しい銘柄の AI 分析」だけ。
 */

/** 無料体験で分析できる銘柄数 */
export const FREE_TICKER_LIMIT = 10;

/** 無料体験の日数（Rust 側 `trial.rs` の `TRIAL_DAYS` と揃える） */
export const TRIAL_DAYS = 21;

/** 制限に引っかかった理由。ダイアログの文面を切り替えるのに使う。 */
export type BlockReason = "none" | "trialExpired" | "tickerLimit";

export interface AccessInput {
  /** ライセンスが有効か */
  activated: boolean;
  /** これまでに分析した銘柄（大文字） */
  usedTickers: string[];
  /** これから分析しようとしている銘柄 */
  ticker: string;
  /** 体験期間が切れているか */
  trialExpired?: boolean;
}

export interface AccessResult {
  allowed: boolean;
  /** 未使用の銘柄か（新しく枠を消費するか） */
  isNew: boolean;
  /** 残り枠。ライセンス有効なら null（無制限） */
  remaining: number | null;
  /** 制限に達したか（ダイアログを出す条件） */
  limitReached: boolean;
  /** なぜ止めたか */
  reason: BlockReason;
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
 * - ライセンスが有効 → 常に許可（期間も銘柄数も無制限）
 * - すでに使った銘柄 → 許可（**期限切れでも再分析はできる**）
 * - 未使用で期限切れ → 拒否（`trialExpired`）
 * - 未使用で枠が尽きた → 拒否（`tickerLimit`）
 * - それ以外 → 許可
 */
export function evaluateAccess({
  activated,
  usedTickers,
  ticker,
  trialExpired = false,
}: AccessInput): AccessResult {
  const used = uniqueTickers(usedTickers);
  const target = normalizeTicker(ticker);
  const isNew = target !== "" && !used.includes(target);

  if (activated) {
    return { allowed: true, isNew, remaining: null, limitReached: false, reason: "none" };
  }

  const remaining = Math.max(FREE_TICKER_LIMIT - used.length, 0);

  // すでに使った銘柄なら、枠が尽きていても期限が切れていても通す
  if (!isNew) {
    return { allowed: true, isNew: false, remaining, limitReached: false, reason: "none" };
  }

  /*
   * **期間切れを先に見る。** 枠が余っていても期限が来ていれば使えないので、
   * 「あと N 銘柄使えます」と誤解させる案内を出さない。
   */
  if (trialExpired) {
    return { allowed: false, isNew: true, remaining, limitReached: true, reason: "trialExpired" };
  }

  const allowed = remaining > 0;
  return {
    allowed,
    isNew: true,
    remaining,
    limitReached: !allowed,
    reason: allowed ? "none" : "tickerLimit",
  };
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
  if (result.reason === "trialExpired") return "無料体験期間が終了しました";
  if (result.remaining === 0) return "無料版の分析枠を使い切りました";
  return `無料版であと ${result.remaining} 銘柄を分析できます`;
}

/** 体験期間の残りを伝える文。期限切れ・ライセンス有効なら空。 */
export function trialLabel(remainingDays: number, activated: boolean): string {
  if (activated || remainingDays <= 0) return "";
  return `無料体験はあと ${remainingDays} 日です`;
}
