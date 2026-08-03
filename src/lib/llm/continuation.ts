import { t } from "@/lib/i18n/i18n";

/**
 * 出力上限で切れたときに、続きを取りに行くための組み立て。
 *
 * **切れたまま終わらせない。** 評価テーブルが途中で止まると、
 * パーサが行を拾えず、その回の分析がまるごと使えなくなる。
 */

/**
 * 継続の上限。
 *
 * **無制限にしない。** 続きを求め続けても終わらないモデルがあり、
 * その場合は費用だけが増える。3 回で足りなければ、
 * 1 回の出力に詰め込みすぎている（分割の対象）と考えるほうが正しい。
 */
export const MAX_CONTINUATIONS = 3;

/**
 * 継続を求めるときに渡す本文。
 *
 * **末尾だけを渡す。** 全文を毎回渡すと、続きを求めるたびに
 * 入力トークンが積み上がり、上限に当たった原因をさらに悪くする。
 */
export const TAIL_CHARS = 2000;

export function continuationPrompt(soFar: string): string {
  const tail = soFar.length > TAIL_CHARS ? soFar.slice(-TAIL_CHARS) : soFar;
  return [t("prompt.continueTask"), "", t("prompt.continueHeading"), tail].join("\n");
}

/**
 * 続きを前のテキストへつなぐ。
 *
 * **重なりを落としてから足す。** モデルは指示しても直前の行を
 * 繰り返すことがあり、そのまま足すと同じ行が二重に並ぶ。
 */
export function joinContinuation(soFar: string, addition: string): string {
  const next = addition.replace(/^\s+/, "");
  if (next === "") return soFar;

  // 末尾と先頭の重なりを、長いほうから探す
  const window = Math.min(soFar.length, next.length, 500);
  for (let size = window; size >= 20; size -= 1) {
    if (soFar.endsWith(next.slice(0, size))) {
      return soFar + next.slice(size);
    }
  }

  /*
   * **行の重なりも見る。** 切れた行をそのまま書き直してくることが多く、
   * 短い行だと上の文字数判定に引っかからない。
   * 途中で切れた最後の行と、続きの最初の行が同じ始まりなら、
   * こちらの行を捨てて続き側を採る（続きのほうが完全なため）。
   */
  const lines = soFar.split("\n");
  const lastLine = lines[lines.length - 1];
  if (lastLine.trim() !== "" && next.startsWith(lastLine.trim())) {
    return [...lines.slice(0, -1), next].join("\n");
  }

  // 行の途中で切れていれば、そのままつなぐ（改行を入れると 1 行が割れる）
  const brokenMidLine = !soFar.endsWith("\n") && !next.startsWith("|");
  return brokenMidLine ? soFar + next : `${soFar.replace(/\s+$/, "")}\n${next}`;
}

/** あと何回続けられるか。 */
export function canContinue(attempt: number, max = MAX_CONTINUATIONS): boolean {
  return attempt < max;
}
