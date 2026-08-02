import type { DebateStatus } from "@/types";

/**
 * 1 ターンディベートの進行状態。
 *
 * **1 往復で必ず止まる。** 反論に再反論、さらに再々反論…と続けさせると、
 * API 費用が青天井になるうえ、同じ論点を言い換えるだけの往復に落ちていく。
 */

/** ディベートの進行段階。 */
export type DebatePhase =
  | "idle"
  /** 批判側（Bear）が生成中 */
  | "critique"
  /** 反論側（Bull）が生成中 */
  | "rebuttal"
  /** 1 往復が完了 */
  | "done"
  | "error";

/** 実行できない理由。null なら実行できる。 */
export type DebateBlock =
  /** メイン分析の出力がまだ無い */
  | "noAnalysis"
  /** ディベート側のプロバイダに APIキーが無い */
  | "noKey"
  /** すでに走っている */
  | "running";

export interface DebateGate {
  canRun: boolean;
  reason: DebateBlock | null;
}

/**
 * いま実行してよいかを判定する。
 *
 * **理由まで返す。** 押せない理由が分からないボタンは、
 * 壊れているのか使い方が違うのかを区別できない。
 */
export function debateGate(input: {
  analysisText: string | null;
  status: DebateStatus | null;
  phase: DebatePhase;
}): DebateGate {
  if (isRunning(input.phase)) return { canRun: false, reason: "running" };
  if (!input.analysisText || input.analysisText.trim() === "") {
    return { canRun: false, reason: "noAnalysis" };
  }
  if (!input.status?.ready) return { canRun: false, reason: "noKey" };
  return { canRun: true, reason: null };
}

/** 生成中か。中断ボタンの出し分けに使う。 */
export function isRunning(phase: DebatePhase): boolean {
  return phase === "critique" || phase === "rebuttal";
}

/**
 * 批判側へ渡す本文を組み立てる。
 *
 * **システムプロンプトは Rust 側が持つ。** ここで作るのは「何を検証するか」だけ。
 */
export function critiqueInput(ticker: string, analysisText: string): string {
  return [`Ticker: ${ticker || "-"}`, "", "--- ANALYSIS UNDER REVIEW ---", analysisText.trim()].join(
    "\n",
  );
}

/**
 * 反論側へ渡す本文を組み立てる。
 *
 * 元の分析と指摘の**両方**を渡す。指摘だけ渡すと、
 * 何を書いたか思い出せないまま謝るだけの応答になる。
 */
export function rebuttalInput(
  ticker: string,
  analysisText: string,
  critique: string,
): string {
  return [
    `Ticker: ${ticker || "-"}`,
    "",
    "--- YOUR ORIGINAL ANALYSIS ---",
    analysisText.trim(),
    "",
    "--- FINDINGS FILED AGAINST IT ---",
    critique.trim(),
  ].join("\n");
}

/**
 * 次の段階を返す。1 往復で `done` に落ちて、そこから先へは進まない。
 */
export function nextPhase(phase: DebatePhase): DebatePhase {
  switch (phase) {
    case "idle":
    case "done":
    case "error":
      return "critique";
    case "critique":
      return "rebuttal";
    case "rebuttal":
      return "done";
  }
}
