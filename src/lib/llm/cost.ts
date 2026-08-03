/**
 * 消費トークンからコストを概算する。
 *
 * **「概算」であることを表示にも残す。** 単価は変わるし、
 * キャッシュ割引やバッチ割引も効くので、請求額とは一致しない。
 * 一致するかのように見せると、ずれたときに数字全体が信用されなくなる。
 */

/** 100 万トークンあたりの単価（USD）。 */
export interface Rate {
  input: number;
  output: number;
}

/**
 * モデル名の一部 → 単価。**前方一致ではなく部分一致**で引く。
 * `gpt-4o-2024-08-06` のような日付付きでも当たるようにするため。
 *
 * 並び順が優先順位。長い（＝具体的な）名前を先に置く。
 */
const RATES: { match: string; rate: Rate }[] = [
  { match: "claude-opus", rate: { input: 5, output: 25 } },
  { match: "claude-sonnet", rate: { input: 3, output: 15 } },
  { match: "claude-haiku", rate: { input: 1, output: 5 } },
  { match: "gpt-4o-mini", rate: { input: 0.15, output: 0.6 } },
  { match: "gpt-4o", rate: { input: 2.5, output: 10 } },
  { match: "gpt-4.1-mini", rate: { input: 0.4, output: 1.6 } },
  { match: "gpt-4.1", rate: { input: 2, output: 8 } },
  { match: "gpt-5", rate: { input: 1.25, output: 10 } },
  { match: "o3", rate: { input: 2, output: 8 } },
  { match: "gemini-2.5-pro", rate: { input: 1.25, output: 10 } },
  { match: "gemini-2.5-flash", rate: { input: 0.3, output: 2.5 } },
  { match: "gemini", rate: { input: 0.3, output: 2.5 } },
];

/** 為替の既定値（1 USD = ? JPY）。設定で変えられるようにするまでの暫定。 */
export const DEFAULT_USD_JPY = 155;

/**
 * モデル名から単価を引く。**知らないモデルは null。**
 * 適当な単価で埋めると、桁違いの金額を出しかねない。
 */
export function rateFor(model: string | null): Rate | null {
  if (!model) return null;
  const key = model.toLowerCase();
  return RATES.find((r) => key.includes(r.match))?.rate ?? null;
}

export interface CostEstimate {
  usd: number;
  jpy: number;
  /** 単価が分からず概算できなかった */
  unknownModel: boolean;
}

/** 消費トークンとモデルからコストを見積もる。 */
export function estimateCost(input: {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  usdJpy?: number;
}): CostEstimate {
  const rate = rateFor(input.model);
  if (!rate) return { usd: 0, jpy: 0, unknownModel: true };

  const usd =
    (input.inputTokens / 1_000_000) * rate.input +
    (input.outputTokens / 1_000_000) * rate.output;

  return {
    usd,
    jpy: usd * (input.usdJpy ?? DEFAULT_USD_JPY),
    unknownModel: false,
  };
}

/**
 * 表示用に丸める。
 *
 * **小さすぎる額は「0」と出さない。** 1 回 0.3 円の分析でも、
 * 0 と出ると「無料だ」と受け取られる。下限を持たせて必ず桁を見せる。
 */
export function formatJpy(jpy: number): string {
  if (jpy <= 0) return "¥0";
  if (jpy < 1) return `¥${jpy.toFixed(2)}`;
  if (jpy < 100) return `¥${jpy.toFixed(1)}`;
  return `¥${Math.round(jpy).toLocaleString()}`;
}

export function formatUsd(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** `12,400 tkn` の形。 */
export function formatTokens(tokens: number): string {
  return `${Math.max(0, Math.round(tokens)).toLocaleString()} tkn`;
}
