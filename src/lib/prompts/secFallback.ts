import type { FilingStatus } from "@/types";

/**
 * SEC 提出書類を取りに行くかどうかの判断。
 *
 * **資料が 1 件も添付されていないときは、黙って何も無いまま分析させない。**
 * 米国上場銘柄なら EDGAR に必ず提出書類があるので、取りに行かない理由が無い。
 * 一次資料の裏付けが無い分析は、指標だけを眺めた感想に近づく。
 */

export type FilingFetchMode =
  /** 取りに行かない */
  | "skip"
  /** 添付資料と併せて使う（従来どおり） */
  | "requested"
  /** 添付が無いので自動で補う */
  | "autoFallback";

/** 取りに行かない理由。`skip` のときだけ入る。 */
export type FilingSkipReason =
  /** EDGAR に登録が無い（非米国上場など） */
  | "notInEdgar"
  /** SEC が要求する User-Agent（連絡先）が未設定 */
  | "userAgentMissing"
  /** 10-K も 10-Q も見つからない */
  | "noFilings"
  /** 提出状況をまだ確認できていない */
  | "unknown";

export interface FilingPlan {
  mode: FilingFetchMode;
  reason: FilingSkipReason | null;
  /**
   * 取得を試みるフォームの優先順。
   * **10-Q を先に置く。** 直近の状況を見たいので四半期が先で、無ければ年次。
   */
  forms: string[];
}

/** 優先順は固定。ここを入れ替えると「直近を見る」という前提が崩れる。 */
const FORMS = ["10-Q", "10-K"];

export function planFilingFetch(input: {
  documentCount: number;
  status: FilingStatus | null;
}): FilingPlan {
  const skip = (reason: FilingSkipReason): FilingPlan => ({ mode: "skip", reason, forms: [] });

  if (!input.status) return skip("unknown");
  if (input.status.status === "notInEdgar") return skip("notInEdgar");
  if (input.status.status === "userAgentMissing") return skip("userAgentMissing");
  if (input.status.status === "noFilings") return skip("noFilings");
  if (input.status.status !== "ok") return skip("unknown");

  // 10-K も 10-Q も無いなら取りに行っても空振りする
  if (!input.status.latest10k && !input.status.latest10q) return skip("noFilings");

  return {
    mode: input.documentCount > 0 ? "requested" : "autoFallback",
    reason: null,
    forms: FORMS,
  };
}

/**
 * 自動取得だったかどうか。
 *
 * **画面と結果に明示するために使う。**
 * ユーザーが渡していない資料が根拠に入るので、黙って使ってはいけない。
 */
export function isAutoFallback(plan: FilingPlan): boolean {
  return plan.mode === "autoFallback";
}
