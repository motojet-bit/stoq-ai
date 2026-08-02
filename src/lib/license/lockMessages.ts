import { FREE_TICKER_LIMIT, TRIAL_DAYS, type BlockReason } from "@/lib/license/freeTier";

/**
 * 制限に引っかかったときの文面。
 *
 * **理由ごとに書き分ける。** 「使えません」だけだと、期間が切れたのか
 * 枠を使い切ったのかが分からず、何をすれば直るのかも伝わらない。
 */

/** ダイアログの見出し。 */
export function lockTitle(reason: BlockReason): string {
  if (reason === "trialExpired") {
    return `⏳ ${TRIAL_DAYS / 7}週間の無料体験期間が終了しました`;
  }
  return `🔒 無料版の分析上限（${FREE_TICKER_LIMIT}銘柄）に達しました`;
}

/** ダイアログの本文。 */
export function lockBody(reason: BlockReason): string {
  if (reason === "trialExpired") {
    return (
      `${TRIAL_DAYS / 7}週間の無料体験期間が終了しました。` +
      "全機能を継続して利用するにはライセンスキーを入力してください。"
    );
  }
  return (
    `無料体験では ${FREE_TICKER_LIMIT} 銘柄まで分析できます。` +
    `${FREE_TICKER_LIMIT + 1} 銘柄目以降の無制限分析を行うには、ライセンスキーを有効化してください。`
  );
}

/** ボタンのホバーに出す一行。 */
export const LOCK_HINT: Record<Exclude<BlockReason, "none">, string> = {
  trialExpired: `⏳ ${TRIAL_DAYS / 7}週間の無料体験期間が終了しました。全機能を継続して利用するにはライセンスキーを入力してください`,
  tickerLimit: `🔒 無料版の分析上限（${FREE_TICKER_LIMIT}銘柄）に達しました。ライセンスキーを入力すると無制限になります`,
};

/**
 * 期限切れでも失われないもの。ダイアログで必ず伝える。
 * 「もう何も見られない」と誤解されると、単に不信感だけが残る。
 */
export const KEPT_ON_LOCK = [
  "保存済みの分析結果の閲覧",
  "分析済み銘柄の再分析",
  "過去ログ・ポートフォリオの参照",
];
