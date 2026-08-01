import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { cancelChat, streamChat } from "@/lib/llm/client";
import { buildAnalysisPrompt, type PromptDocument } from "@/lib/prompts/buildPrompt";
import { parseAnalysis, type AnalysisResult } from "@/lib/prompts/parseAnalysis";
import { readDocumentText } from "@/lib/parser/documentStore";
import { pushToast, toastError } from "@/lib/ui/toastStore";
import type {
  AppSettings,
  Fundamentals,
  QuarterlySeries,
  SecFilingText,
  StagedDocument,
} from "@/types";

/** 1 銘柄分の分析実行状態 */
export interface AnalysisRun {
  ticker: string;
  /** 実行中の段階 */
  phase: "idle" | "collecting" | "streaming" | "done" | "error" | "cancelled";
  /** 中断に使う ID */
  requestId: string | null;
  /** ストリーミング中の生テキスト */
  raw: string;
  /** 逐次パースした構造化結果 */
  result: AnalysisResult | null;
  error: string | null;
  /** プロンプトの切り詰めなどの注記 */
  notes: string[];
  promptTokens: number;
  model: string | null;
  finishedAtMs: number | null;
}

let runs: Record<string, AnalysisRun> = {};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAnalysisRuns(): Record<string, AnalysisRun> {
  return useSyncExternalStore(
    subscribe,
    () => runs,
    () => runs,
  );
}

function blank(ticker: string): AnalysisRun {
  return {
    ticker,
    phase: "idle",
    requestId: null,
    raw: "",
    result: null,
    error: null,
    notes: [],
    promptTokens: 0,
    model: null,
    finishedAtMs: null,
  };
}

function patch(ticker: string, changes: Partial<AnalysisRun>) {
  const current = runs[ticker] ?? blank(ticker);
  runs = { ...runs, [ticker]: { ...current, ...changes } };
  emit();
}

// ---------------------------------------------------------------- 実行

export interface RunOptions {
  ticker: string;
  settings: AppSettings | null;
  fundamentals: Fundamentals | null;
  quarterly: QuarterlySeries | null;
  /** SEC 提出書類を取りに行くか（提出状況が ok のときだけ true） */
  fetchFiling: boolean;
  documents: StagedDocument[];
}

/** 応答のために空けておくトークン数 */
const RESERVE_FOR_OUTPUT = 8_000;

/**
 * 20項目のファンダメンタル分析を実行する。
 *
 * 資料収集 → プロンプト構築 → ストリーミング生成 の順に進み、
 * 途中経過を逐次パースして UI に流す。
 */
export async function runAnalysis(options: RunOptions): Promise<void> {
  const { ticker, settings } = options;

  if (!isTauri()) {
    pushToast(
      "warning",
      "ブラウザでは分析を実行できません",
      "`npm run tauri:dev` で起動してください。",
    );
    return;
  }

  const requestId = crypto.randomUUID();
  patch(ticker, {
    phase: "collecting",
    requestId,
    raw: "",
    result: null,
    error: null,
    notes: [],
    finishedAtMs: null,
  });

  try {
    // --- 資料収集 -------------------------------------------------
    const documents: PromptDocument[] = [];
    for (const doc of options.documents) {
      try {
        documents.push({ name: doc.displayName, text: await readDocumentText(doc.id) });
      } catch {
        // 1 件読めなくても分析は続行する
      }
    }

    let filing = null;
    if (options.fetchFiling) {
      try {
        const fetched = await invoke<SecFilingText>("sec_fetch_latest_filing", {
          ticker,
          forms: ["10-Q", "10-K"],
        });
        filing = {
          form: fetched.form,
          filed: fetched.filed,
          period: fetched.period,
          url: fetched.url,
          text: fetched.text,
        };
      } catch (e) {
        pushToast(
          "warning",
          "SEC 提出書類を取得できませんでした",
          `${e instanceof Error ? e.message : String(e)} 財務指標と添付資料のみで分析します。`,
        );
      }
    }

    // --- プロンプト構築 -------------------------------------------
    const prompt = buildAnalysisPrompt({
      ticker,
      fundamentals: options.fundamentals,
      quarterly: options.quarterly,
      filing,
      documents,
      tokenLimit: settings?.maxPromptTokens ?? 180_000,
      reserveForOutput: RESERVE_FOR_OUTPUT,
    });

    patch(ticker, {
      phase: "streaming",
      notes: prompt.notes,
      promptTokens: prompt.tokens,
    });

    // --- 生成 ------------------------------------------------------
    let raw = "";
    const { cancelled } = await streamChat(
      {
        requestId,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
        maxTokens: RESERVE_FOR_OUTPUT,
      },
      {
        onStart: (_provider, model) => patch(ticker, { model }),
        onDelta: (delta) => {
          raw += delta;
          // 途中経過も構造化して描画する
          patch(ticker, { raw, result: parseAnalysis(raw) });
        },
      },
    );

    const finalRaw = raw.length > 0 ? raw : "";
    patch(ticker, {
      phase: cancelled ? "cancelled" : "done",
      raw: finalRaw,
      result: parseAnalysis(finalRaw),
      requestId: null,
      finishedAtMs: Date.now(),
    });

    if (cancelled) {
      pushToast("info", "分析を中断しました", "途中までの結果は残しています。");
    } else {
      pushToast("success", `${ticker} の分析が完了しました`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    patch(ticker, {
      phase: "error",
      error: message,
      requestId: null,
      finishedAtMs: Date.now(),
    });
    toastError(`${ticker} の分析に失敗しました`, e);
  }
}

/** 実行中の分析を中断する。 */
export async function cancelAnalysis(ticker: string): Promise<void> {
  const run = runs[ticker];
  if (!run?.requestId) return;
  await cancelChat(run.requestId);
}
