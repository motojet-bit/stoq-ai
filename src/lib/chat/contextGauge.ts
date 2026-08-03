import { estimateTokens } from "@/lib/parser/tokenCount";
import type { ChatMessage } from "@/types";

/**
 * いまの会話がコンテキストをどれだけ使っているか。
 *
 * **使い切ってから気づくのでは遅い。** 上限に当たると、
 * 古い発言が落ちて話が噛み合わなくなるか、そもそも送信が失敗する。
 * 要約して新しい会話へ移す判断は、埋まる前にしかできない。
 */

export type GaugeLevel = "ok" | "warn" | "danger";

export interface ContextUsage {
  /** 概算の消費トークン */
  used: number;
  /** モデルの上限 */
  limit: number;
  /** 0〜1 */
  ratio: number;
  level: GaugeLevel;
}

/**
 * モデル名 → コンテキスト上限（トークン）。
 *
 * 並び順が優先順位。**長い（具体的な）名前を先に**置く。
 */
const LIMITS: { match: string; limit: number }[] = [
  { match: "claude-opus", limit: 1_000_000 },
  { match: "claude-sonnet", limit: 1_000_000 },
  { match: "claude-haiku", limit: 200_000 },
  { match: "claude", limit: 200_000 },
  { match: "gpt-4o-mini", limit: 128_000 },
  { match: "gpt-4o", limit: 128_000 },
  { match: "gpt-4.1", limit: 1_000_000 },
  { match: "gpt-5", limit: 400_000 },
  { match: "o3", limit: 200_000 },
  { match: "gemini-2.5", limit: 1_000_000 },
  { match: "gemini", limit: 1_000_000 },
];

/**
 * 知らないモデルのときに使う上限。
 *
 * **控えめな値にする。** 大きく見積もると「まだ余裕がある」と表示され、
 * 実際には上限に当たる。少なめに出しておけば、早めに気づける。
 */
export const DEFAULT_CONTEXT_LIMIT = 128_000;

export function contextLimitFor(model: string | null): number {
  if (!model) return DEFAULT_CONTEXT_LIMIT;
  const key = model.toLowerCase();
  return LIMITS.find((l) => key.includes(l.match))?.limit ?? DEFAULT_CONTEXT_LIMIT;
}

/** 色の切り替え点。70% 未満は緑、85% 以上は赤。 */
export function levelOf(ratio: number): GaugeLevel {
  if (ratio >= 0.85) return "danger";
  if (ratio >= 0.7) return "warn";
  return "ok";
}

/**
 * 会話とシステムプロンプトから使用量を見積もる。
 *
 * **送るものをすべて数える。** 画面に出ている発言だけを数えると、
 * システムプロンプトのぶんだけ実際より少なく見える。
 */
export function contextUsage(input: {
  messages: Pick<ChatMessage, "content">[];
  systemPrompt?: string;
  model: string | null;
}): ContextUsage {
  const limit = contextLimitFor(input.model);

  let used = estimateTokens(input.systemPrompt ?? "");
  for (const message of input.messages) used += estimateTokens(message.content);

  const ratio = limit <= 0 ? 0 : Math.min(1, used / limit);
  return { used, limit, ratio, level: levelOf(ratio) };
}

/** `44.8k` の形。桁が多いと横幅を食うので短く出す。 */
export function formatCompactTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.max(0, Math.round(tokens)));
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** ゲージの目盛り（■ と □）。 */
export function gaugeBlocks(ratio: number, size = 5): { filled: number; total: number } {
  // 少しでも使っていれば 1 つは点ける（0 のままだと動いていないように見える）
  const filled = ratio <= 0 ? 0 : Math.max(1, Math.round(ratio * size));
  return { filled: Math.min(size, filled), total: size };
}
