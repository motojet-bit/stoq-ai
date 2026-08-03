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
/** どちらの立場の発言か。 */
export type DebateSide = "bear" | "bull";

/** 続きの対話 1 件。 */
export interface DebateMessage {
  id: string;
  /** `user` は利用者自身の問いかけ */
  role: "user" | DebateSide;
  text: string;
}

export interface DebateRun {
  ticker: string;
  phase: DebatePhase;
  /** 批判側（Bear）の出力 */
  critique: string;
  /** 反論側（Bull）の出力 */
  rebuttal: string;
  /**
   * 1 往復のあとに続けた自由対話。
   * **1 往復で打ち切らない。** 納得できるまで詰めたい人には、
   * 同じ論点を自分の言葉で問い直せる余地が要る。
   */
  messages: DebateMessage[];
  /** 続きの返答を生成中の立場。していなければ null */
  replying: DebateSide | null;
  /** 中断に使う ID。走っていなければ null */
  requestId: string | null;
  /** 中断を要求済みか（連打で再スタートを踏まないようにする） */
  cancelling: boolean;
  error: string | null;
}

const empty = (ticker: string): DebateRun => ({
  ticker,
  phase: "idle",
  critique: "",
  rebuttal: "",
  messages: [],
  replying: null,
  requestId: null,
  cancelling: false,
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
  if (!run?.requestId || run.cancelling) return;
  // 先に立てる。通信の往復を待つと、その間に押せてしまう
  patch(ticker, { cancelling: true });
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
    messages: [],
    replying: null,
    requestId: critiqueId,
    cancelling: false,
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

/**
 * 1 往復のあとに、自由に問い直す。
 *
 * **往復の上限は設けない。** ただし自動では続けず、
 * **毎回ユーザーが押したときだけ**呼ぶ。
 * 自動継続にすると費用が青天井になり、言い換えの往復に落ちていく。
 */
export async function askDebate(
  ticker: string,
  question: string,
  side: DebateSide,
): Promise<void> {
  const text = question.trim();
  if (text === "") return;

  const run = runs.get(ticker);
  // 1 往復が済んでいない状態では受け付けない（土台が無い）
  if (!run || run.phase !== "done" || run.replying !== null) return;

  const settings = getSettings();
  const status = settings?.debate ?? null;

  const userMessage: DebateMessage = { id: crypto.randomUUID(), role: "user", text };
  const requestId = crypto.randomUUID();
  patch(ticker, {
    messages: [...run.messages, userMessage],
    replying: side,
    requestId,
    cancelling: false,
    error: null,
  });

  /*
   * 立場ごとに渡すものを変える。
   * **批判側は別プロバイダ、反論側はメイン**（最初の 1 往復と同じ担当）。
   */
  const provider =
    side === "bear" ? ((status?.effectiveProvider || undefined) as ProviderId | undefined) : undefined;
  const model = side === "bear" ? status?.effectiveModel || undefined : undefined;

  // これまでのやり取りを渡す。どこまで話したかを踏まえて答えさせる
  const history = [...run.messages, userMessage]
    .map((m) => `[${m.role}] ${m.text}`)
    .join("\n\n");

  const context = [
    side === "bear" ? run.rebuttal : run.critique,
    history === "" ? "" : `--- FOLLOW-UP ---\n${history}`,
  ]
    .filter((v) => v.trim() !== "")
    .join("\n\n");

  const replyId = crypto.randomUUID();
  let reply = "";
  try {
    const result = await streamChat(
      {
        requestId,
        provider,
        model,
        debate: side,
        messages: [{ role: "user", content: context }],
      },
      {
        onDelta: (delta) => {
          reply += delta;
          const current = runs.get(ticker);
          if (!current) return;
          const others = current.messages.filter((m) => m.id !== replyId);
          patch(ticker, {
            messages: [...others, { id: replyId, role: side, text: reply }],
          });
        },
      },
    );

    const current = runs.get(ticker);
    const others = (current?.messages ?? []).filter((m) => m.id !== replyId);
    patch(ticker, {
      messages: [...others, { id: replyId, role: side, text: result.text || reply }],
      replying: null,
      requestId: null,
      cancelling: false,
    });
  } catch (e) {
    patch(ticker, { replying: null, requestId: null, cancelling: false, error: errorMessage(e) });
    toastError(t("debate.replyFailed"), e);
  }
}
