import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { cancelChat, streamChat } from "@/lib/llm/client";
import { buildAnalysisPrompt, type PromptDocument } from "@/lib/prompts/buildPrompt";
import {
  getActiveRoleId,
  systemPromptTokens,
} from "@/lib/prompts/analystRoleStore";
import { mergeThresholds } from "@/lib/prompts/thresholds";
import {
  buildAnalysisRecord,
  serializeAnalysisRecord,
} from "@/lib/export/analysisRecord";
import { parseAnalysis, type AnalysisResult } from "@/lib/prompts/parseAnalysis";
import { readDocumentText } from "@/lib/parser/documentStore";
import { isAutoFallback, planFilingFetch } from "@/lib/prompts/secFallback";
import { pushToast, toastError } from "@/lib/ui/toastStore";
import type {
  AppSettings,
  FilingStatus,
  Fundamentals,
  QuarterlySeries,
  SavedAnalysis,
  SecFilingText,
  StagedDocument,
} from "@/types";
import { t } from "@/lib/i18n/i18n";
import { errorMessage } from "@/lib/errors/errorMessage";

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
  /** 分析に使ったデータ元（例: t("basis.metrics"), "SEC開示書類 10-Q (2026-07-31)"） */
  basis: string[];
  promptTokens: number;
  model: string | null;
  provider: string | null;
  finishedAtMs: number | null;
  /** SQLite から復元したものか */
  fromCache: boolean;
  /** 保存日時 */
  savedAtMs: number | null;
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
    basis: [],
    promptTokens: 0,
    model: null,
    provider: null,
    finishedAtMs: null,
    fromCache: false,
    savedAtMs: null,
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
  /**
   * SEC の提出状況。取りに行くかは `planFilingFetch` が決める。
   * **添付が無ければ自動で補う**ので、呼び出し側で判断させない。
   */
  filingStatus: FilingStatus | null;
  documents: StagedDocument[];
  /**
   * ユーザーが確認・確定した決算期（`FY2023-Q3`）。
   * **自動特定より優先する。** 人が直した内容を機械が上書きしては意味が無い。
   */
  confirmedPeriodKey?: string | null;
  /** 親（四半期本体）の履歴 ID。期中のアドホック分析ならここに指定する */
  parentId?: string | null;
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
      t("toast.analysis.browserOnly"),
      t("toast.analysis.browserHint"),
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
    basis: [],
    finishedAtMs: null,
    fromCache: false,
    savedAtMs: null,
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

    /*
     * 添付が 1 件も無ければ SEC から自動で補う。
     * **自動取得したことは画面と結果に必ず出す。**
     * ユーザーが渡していない資料が根拠に入るので、黙って使ってはいけない。
     */
    const filingPlan = planFilingFetch({
      documentCount: documents.length,
      status: options.filingStatus,
    });

    let filing = null;
    let filingAuto = false;
    if (filingPlan.mode !== "skip") {
      try {
        const fetched = await invoke<SecFilingText>("sec_fetch_latest_filing", {
          ticker,
          forms: filingPlan.forms,
        });
        filing = {
          form: fetched.form,
          filed: fetched.filed,
          period: fetched.period,
          url: fetched.url,
          text: fetched.text,
        };
        filingAuto = isAutoFallback(filingPlan);
        if (filingAuto) {
          pushToast(
            "info",
            t("toast.analysis.secAuto"),
            t("toast.analysis.secAutoWhy", { form: fetched.form, filed: fetched.filed }),
          );
        }
      } catch (e) {
        pushToast(
          "warning",
          t("toast.analysis.secFailed"),
          t("toast.analysis.secFallback", {
        reason: errorMessage(e),
      }),
        );
      }
    }

    // --- プロンプト構築 -------------------------------------------
    /*
     * システムプロンプトは Rust 側の秘匿定数から組み立てられる。
     * フロントは**役割 ID と閾値だけ**を渡し、本文は受け取らない。
     * 長さ（トークン数）だけを取得して資料の予算計算に使う。
     */
    const roleId = getActiveRoleId();
    const thresholds = mergeThresholds(settings?.thresholds);
    const systemTokens = await systemPromptTokens(roleId, thresholds);

    const prompt = buildAnalysisPrompt({
      ticker,
      fundamentals: options.fundamentals,
      quarterly: options.quarterly,
      filing,
      filingAuto,
      documents,
      tokenLimit: settings?.maxPromptTokens ?? 180_000,
      reserveForOutput: RESERVE_FOR_OUTPUT,
      systemTokens,
    });

    // 何をもとに分析したかを記録し、UI に出す
    const basis: string[] = [];
    if (options.fundamentals) basis.push(t("basis.metrics"));
    if (options.quarterly && options.quarterly.quarters.length > 0) {
      basis.push(t("basis.quarterly", { count: options.quarterly.quarters.length }));
    }
    if (filing) {
      basis.push(
        filingAuto
          ? t("basis.filingAuto", { form: filing.form, filed: filing.filed })
          : t("basis.filing", { form: filing.form, filed: filing.filed }),
      );
    }
    if (documents.length > 0) {
      const names = documents.map((d) => d.name);
      basis.push(
        documents.length === 1
          ? t("basis.document", { name: names[0] })
          : t("basis.documents", { name: names[0], count: documents.length - 1 }),
      );
    }
    if (basis.length === 0) basis.push(t("basis.none"));

    patch(ticker, {
      phase: "streaming",
      notes: prompt.notes,
      basis,
      promptTokens: prompt.tokens,
    });

    // --- 生成 ------------------------------------------------------
    let raw = "";
    const { cancelled } = await streamChat(
      {
        requestId,
        // 役割 ID と閾値だけを渡す。秘匿プロンプトとの結合は Rust 側で行う
        analysisPreset: { roleId, thresholds },
        messages: [{ role: "user", content: prompt.user }],
        maxTokens: RESERVE_FOR_OUTPUT,
      },
      {
        onStart: (provider, model) => patch(ticker, { provider, model }),
        onDelta: (delta) => {
          raw += delta;
          // 途中経過も構造化して描画する
          patch(ticker, { raw, result: parseAnalysis(raw) });
        },
      },
    );

    const finalRaw = raw;
    patch(ticker, {
      phase: cancelled ? "cancelled" : "done",
      raw: finalRaw,
      result: parseAnalysis(finalRaw),
      requestId: null,
      finishedAtMs: Date.now(),
    });

    // 生成完了と同時に SQLite へ自動保存する。中断でも途中結果を残す。
    if (finalRaw.trim().length > 0) {
      const current = runs[ticker];
      try {
        const saved = await invoke<SavedAnalysis>("analysis_save", {
          ticker,
          raw: finalRaw,
          provider: current?.provider ?? null,
          model: current?.model ?? null,
          promptTokens: current?.promptTokens ?? 0,
          notes: current?.notes ?? [],
          basis: current?.basis ?? [],
          // アーカイブ一覧に出すため、平均スコアと対象四半期も一緒に残す
          averageScore: current?.result?.averageScore ?? null,
          // 人が確定した期を最優先。無ければ直近四半期のラベルで代用する
          periodLabel:
            options.confirmedPeriodKey ?? options.quarterly?.quarters.at(-1)?.label ?? null,
          parentId: options.parentId ?? null,
          // 構造化データも一緒に残す（エクスポートのたびに解析し直さない）
          record: serializeAnalysisRecord(
            buildAnalysisRecord({
              ticker,
              raw: finalRaw,
              fundamentals: options.fundamentals,
              quarterly: options.quarterly,
              provider: current?.provider ?? null,
              model: current?.model ?? null,
              savedAtMs: Date.now(),
            }),
          ),
        });
        patch(ticker, { savedAtMs: saved.savedAtMs });
      } catch (e) {
        pushToast(
          "warning",
          t("toast.analysis.saveFailed"),
          t("toast.analysis.saveFailedHint", {
            reason: errorMessage(e),
          }),
        );
      }
    }

    if (cancelled) {
      pushToast("info", t("toast.analysis.cancelled"), t("toast.analysis.cancelledHint"));
    } else {
      pushToast("success", t("toast.analysis.done", { ticker }));
    }
  } catch (e) {
    const message = errorMessage(e);
    patch(ticker, {
      phase: "error",
      error: message,
      requestId: null,
      finishedAtMs: Date.now(),
    });
    toastError(t("toast.analysis.failed", { ticker }), e);
  }
}

/** 実行中の分析を中断する。 */
export async function cancelAnalysis(ticker: string): Promise<void> {
  const run = runs[ticker];
  if (!run?.requestId) return;
  await cancelChat(run.requestId);
}

// ---------------------------------------------------------------- 永続化

/**
 * 保存済みの分析結果を復元する。
 *
 * 銘柄タブを開いたときに呼ぶ。実行中や表示済みの結果は上書きしない。
 */
export async function restoreAnalysis(rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker || !isTauri()) return;

  const existing = runs[ticker];
  if (existing && existing.phase !== "idle") return;

  try {
    const saved = await invoke<SavedAnalysis | null>("analysis_load", { ticker });
    if (!saved) return;

    patch(ticker, {
      phase: "done",
      raw: saved.raw,
      result: parseAnalysis(saved.raw),
      notes: saved.notes,
      basis: saved.basis,
      promptTokens: saved.promptTokens,
      provider: saved.provider,
      model: saved.model,
      finishedAtMs: saved.savedAtMs,
      savedAtMs: saved.savedAtMs,
      fromCache: true,
      error: null,
      requestId: null,
    });
  } catch {
    // 復元できなくても分析は実行できるので、通知はしない
  }
}

/**
 * 分析結果を破棄する。
 *
 * **ユーザーが明示的に「クリア」を押したときだけ呼ぶ。**
 * 画面上の表示と SQLite の両方を消す。
 */
export async function clearAnalysis(rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) return;

  runs = { ...runs, [ticker]: blank(ticker) };
  emit();

  if (!isTauri()) return;
  try {
    await invoke("analysis_delete", { ticker });
    pushToast("info", t("toast.analysis.deleted", { ticker }));
  } catch (e) {
    toastError(t("toast.analysis.deleteFailed"), e);
  }
}
