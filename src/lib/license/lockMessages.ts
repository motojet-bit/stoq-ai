import { FREE_TICKER_LIMIT, TRIAL_DAYS, type BlockReason } from "@/lib/license/freeTier";
import { t } from "@/lib/i18n/i18n";

/**
 * 制限に引っかかったときの文面。
 *
 * **理由ごとに書き分ける。** 「使えません」だけだと、期間が切れたのか
 * 枠を使い切ったのかが分からず、何をすれば直るのかも伝わらない。
 */

/** 体験期間の長さを「週」で表す（文面に埋め込む）。 */
const TRIAL_WEEKS = TRIAL_DAYS / 7;

/** ダイアログの見出し。 */
export function lockTitle(reason: BlockReason): string {
  if (reason === "trialExpired") {
    return t("lock.trial.title", { weeks: TRIAL_WEEKS });
  }
  return t("lock.limit.title", { limit: FREE_TICKER_LIMIT });
}

/** ダイアログの本文。 */
export function lockBody(reason: BlockReason): string {
  if (reason === "trialExpired") {
    return t("lock.trial.body", { weeks: TRIAL_WEEKS });
  }
  return t("lock.limit.body", {
    limit: FREE_TICKER_LIMIT,
    next: FREE_TICKER_LIMIT + 1,
  });
}

/**
 * ボタンのホバーに出す一行。
 * **定数にしない**（読み込み時に固めると言語切替に追従しない）。
 */
export function lockHint(reason: Exclude<BlockReason, "none">): string {
  return reason === "trialExpired"
    ? t("lock.trial.hint", { weeks: TRIAL_WEEKS })
    : t("lock.limit.hint", { limit: FREE_TICKER_LIMIT });
}

/**
 * 期限切れでも失われないもの。ダイアログで必ず伝える。
 * 「もう何も見られない」と誤解されると、単に不信感だけが残る。
 */
export function keptOnLock(): string[] {
  return [
    t("lock.kept.viewSaved"),
    t("lock.kept.reanalyze"),
    t("lock.kept.history"),
  ];
}
