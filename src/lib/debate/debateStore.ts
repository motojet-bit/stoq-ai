import { useSyncExternalStore } from "react";
import { cancelChat, streamChat } from "@/lib/llm/client";
import { getSettings } from "@/lib/config/settingsStore";
import { toastError } from "@/lib/ui/toastStore";
import { errorMessage } from "@/lib/errors/errorMessage";
import { t } from "@/lib/i18n/i18n";
import {
  critiqueInput,
  debateGate,
  nextPhase,
  rebuttalInput,
  type DebatePhase,
} from "@/lib/debate/debateTurn";
import type { ProviderId } from "@/types";

/**
 * 1 ターンディベートの実行状態。
 *
 * **銘柄ごとに持つ。** タブを切り替えたときに別銘柄の検証結果が残っていると、
 * どの銘柄への指摘なのか分からなくなる。
 */
export interface DebateRun {
  ticker: string;
  phase: DebatePhase;
  /** 批判側（Bear）の出力 */
  critique: string;
  /** 反論側（Bull）の出力 */
  rebuttal: string;
  /** 中断に使う ID。走っていなければ null */
  requestId: string | null;
  error: string | null;
}

const empty = (ticker: string): DebateRun => ({
  ticker,
  phase: "idle",
  critique: "",
  rebuttal: "",
  requestId: null,
  error: null,
});

const runs = new Map<string, DebateRun>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function patch(ticker: string, next: Partial<DebateRun>) {
  const current = runs.get(ticker) ?? empty(ticker);
  runs.set(ticker, { ...current, ...next });
  emit();
}

export function getDebateRun(ticker: string | null): DebateRun | null {
  if (!ticker) return null;
  return runs.get(ticker) ?? null;
}

/** 銘柄ごとのディベート状態を購読する。 */
export function useDebateRun(ticker: string | null): DebateRun | null {
  const snapshot = () => {
    void version;
    return ticker ? (runs.get(ticker) ?? null) : null;
  };
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** 表示を初期状態へ戻す（結果を捨てる）。 */
export function clearDebate(ticker: string): void {
  runs.delete(ticker);
  emit();
}

/** 生成中の呼び出しを止める。それまでの本文は残す。 */
export async function cancelDebate(ticker: string): Promise<void> {
  const run = runs.get(ticker);
  if (!run?.requestId) return;
  await cancelChat(run.requestId);
}

/**
 * 1 往復（批判 → 反論）を実行する。
 *
 * **ここで必ず止まる。** 反論に再反論を続けさせると API 費用が青天井になり、
 * 同じ論点を言い換えるだけの往復に落ちていく。
 */
export async function runDebateTurn(ticker: string, analysisText: string): Promise<void> {
  const settings = getSettings();
  const status = settings?.debate ?? null;
  const current = runs.get(ticker) ?? empty(ticker);

  const gate = debateGate({ analysisText, status, phase: current.phase });
  if (!gate.canRun) return;

  const provider = (status?.effectiveProvider || undefined) as ProviderId | undefined;
  const model = status?.effectiveModel || undefined;

  // --- 批判（Bear） ------------------------------------------------------
  const critiqueId = crypto.randomUUID();
  patch(ticker, {
    ticker,
    phase: nextPhase("idle"),
    critique: "",
    rebuttal: "",
    requestId: critiqueId,
    error: null,
  });

  let critique = "";
  try {
    const result = await streamChat(
      {
        requestId: critiqueId,
        provider,
        model,
        debate: "bear",
        messages: [{ role: "user", content: critiqueInput(ticker, analysisText) }],
      },
      {
        onDelta: (text) => {
          critique += text;
          patch(ticker, { critique });
        },
      },
    );
    critique = result.text;
    // 中断されたら反論へ進まない（片側だけの指摘で終わらせる）
    if (result.cancelled) {
      patch(ticker, { critique, phase: "done", requestId: null });
      return;
    }
  } catch (e) {
    const message = errorMessage(e);
    patch(ticker, { phase: "error", error: message, requestId: null });
    toastError(t("debate.critiqueFailed"), e);
    return;
  }

  // --- 反論（Bull） ------------------------------------------------------
  const rebuttalId = crypto.randomUUID();
  patch(ticker, { critique, phase: "rebuttal", requestId: rebuttalId, rebuttal: "" });

  let rebuttal = "";
  try {
    const result = await streamChat(
      {
        requestId: rebuttalId,
        // 反論はメイン分析と同じ側が答える（プロバイダ指定なし＝既定）
        debate: "bull",
        messages: [
          { role: "user", content: rebuttalInput(ticker, analysisText, critique) },
        ],
      },
      {
        onDelta: (text) => {
          rebuttal += text;
          patch(ticker, { rebuttal });
        },
      },
    );
    patch(ticker, { rebuttal: result.text, phase: "done", requestId: null });
  } catch (e) {
    const message = errorMessage(e);
    patch(ticker, { phase: "error", error: message, requestId: null });
    toastError(t("debate.rebuttalFailed"), e);
  }
}
