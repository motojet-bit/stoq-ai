/**
 * 株価フィードの見せ方を決める。
 *
 * **色と文字を切り離す。** 上げ下げを色だけで表すと、
 * 色覚特性や暗い画面では読み取れない。符号と矢印を必ず添える。
 */

export type QuoteTone = "up" | "down" | "flat";

/** 前日比から向きを決める。**取れていなければ flat**（緑にも赤にもしない）。 */
export function toneOf(changePercent: number | null | undefined): QuoteTone {
  if (changePercent === null || changePercent === undefined) return "flat";
  if (!Number.isFinite(changePercent)) return "flat";
  if (changePercent > 0) return "up";
  if (changePercent < 0) return "down";
  return "flat";
}

/** 向きごとの文字色。 */
export function toneClass(tone: QuoteTone): string {
  switch (tone) {
    case "up":
      return "text-emerald-400";
    case "down":
      return "text-red-400";
    default:
      return "text-slate-400";
  }
}

/** 向きを表す記号。色を読めない環境のための保険。 */
export function toneArrow(tone: QuoteTone): string {
  switch (tone) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    default:
      return "—";
  }
}

/**
 * 前日比（％）の表示。**符号を必ず付ける。**
 * 取れていなければダッシュを返す（0.00% と書くと「変わらなかった」と誤読される）。
 */
export function formatPercent(changePercent: number | null | undefined): string {
  if (changePercent === null || changePercent === undefined) return "—";
  if (!Number.isFinite(changePercent)) return "—";
  const sign = changePercent > 0 ? "+" : changePercent < 0 ? "-" : "±";
  return `${sign}${Math.abs(changePercent).toFixed(2)}%`;
}

/**
 * 52週レンジの中で今どこにいるか（0〜1）。
 *
 * **高値と安値が同じなら位置を出さない。** 上場直後などで起こり、
 * 割ると位置が定まらないまま棒だけが表示される。
 */
export function rangePosition(
  price: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): number | null {
  if (price == null || low == null || high == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (high <= low) return null;
  const ratio = (price - low) / (high - low);
  // 時間外の値動きでレンジ外に出ることがある。棒からはみ出させない
  return Math.min(1, Math.max(0, ratio));
}

/** 市場が開いているか。**判別できない場合は開いている扱いにしない。** */
export function isMarketOpen(marketState: string | null | undefined): boolean {
  return (marketState ?? "").toUpperCase() === "REGULAR";
}
