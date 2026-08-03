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
import {
  ANALYSIS_STEPS,
  mergeSteps,
  nextStep,
  scoreRowsOnly,
  stepInstruction,
  usableSteps,
} from "@/lib/prompts/analysisSteps";
import { diagnose } from "@/lib/errors/diagnose";
import {
  canContinue,
  continuationPrompt,
  joinContinuation,
  MAX_CONTINUATIONS,
} from "@/lib/llm/continuation";
import { appendUsageLog } from "@/lib/usage/usageStore";
import {
  mapInstruction,
  needsSplit,
  reduceSource,
  splitIntoChunks,
  splitProgress,
} from "@/lib/prompts/mapReduce";
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
  /** 完了した段の数（0〜4） */
  completedSteps: number;
  /** いま生成している段のラベル。走っていなければ null */
  currentStepLabel: string | null;
  /** 実測の消費トークン */
  inputTokens: number;
  outputTokens: number;
  /** 失敗したときの診断。成功時は null */
  diagnosis: ReturnType<typeof diagnose> | null;
  /**
   * 分割分析の進み具合。**分割しないときは null**。
   * null なら段のメーター、入っていればパーセント表示に切り替える。
   */
  splitProgress: { ratio: number; label: string } | null;
  /**
   * 中断を要求済みか。
   * **押した瞬間から立てる。** 立っている間はボタンを無効にして、
   * 連打で「分析開始」に切り替わった瞬間を踏むのを防ぐ。
   */
  cancelling: boolean;
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
    completedSteps: 0,
    currentStepLabel: null,
    inputTokens: 0,
    outputTokens: 0,
    diagnosis: null,
    cancelling: false,
    splitProgress: null,
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
  /**
   * 保存済みの途中経過を捨てて、最初の段からやり直す。
   *
   * **同じところで失敗し続けるのを断ち切るために要る。**
   * 壊れた段が残っていると、再開のたびにそれを土台にしてしまう。
   */
  fresh?: boolean;
  /**
   * SEC から取りに行く対象期。**null なら最新**。
   * 資料なしで過去にさかのぼるときだけ指定する。
   */
  targetPeriod?: { year: number; quarter: 1 | 2 | 3 | 4 | null } | null;
}

interface Checkpoint {
  step: number;
  raw: string;
  inputTokens: number;
  outputTokens: number;
}

/** 保存済みの段を読む。読めなくても分析は始められるので握り潰す。 */
async function loadCheckpoints(ticker: string): Promise<Checkpoint[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<Checkpoint[]>("analysis_steps_load", { ticker });
  } catch {
    return [];
  }
}

/**
 * 1 段ぶんを保存する。
 *
 * **失敗しても分析は止めない。** 保存できないのは困るが、
 * ここで throw すると、生成し終えた本文まで失うことになる。
 */
async function saveCheckpoint(
  ticker: string,
  step: number,
  raw: string,
  usage: { input: number; output: number } | undefined,
): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("analysis_step_save", {
      ticker,
      step,
      raw,
      inputTokens: usage?.input ?? 0,
      outputTokens: usage?.output ?? 0,
    });
  } catch {
    // 保存できなくても生成は続ける
  }
}

async function clearCheckpoints(ticker: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("analysis_steps_clear", { ticker });
  } catch {
    // 消せなくても実害は無い（次回 usableSteps が整合を見る）
  }
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
    // 走り始めたら倒す（前回の中断が残っているとボタンが押せない）
    cancelling: false,
  });

  // 実行ログの起点。中断・エラーで終わってもここからの消費は記録する
  const startedAtMs = Date.now();
  // 分割読み取りで使ったぶん。段の生成ぶんとは別に数えて最後に足す
  let inputTokensPre = 0;
  let outputTokensPre = 0;

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
     * --- 巨大資料の分割読み取り（Map）----------------------------
     *
     * **切り詰めると、削った部分は最初から無かったことになる。**
     * 分けて抜き出し、抜き出しを突き合わせるほうが落ちる情報が少ない。
     * 小さい資料は分けない（呼び出しが増えるぶん費用と時間がかかる）。
     */
    let splitCount = 0;
    for (let i = 0; i < documents.length; i += 1) {
      const doc = documents[i];
      if (!needsSplit(doc.text)) continue;

      const chunks = splitIntoChunks(doc.text);
      if (chunks.length <= 1) continue;

      const summaries: { index: number; heading: string | null; text: string }[] = [];
      for (const chunk of chunks) {
        patch(ticker, {
          phase: "collecting",
          splitProgress: {
            ratio: splitProgress({ mapped: summaries.length, total: chunks.length, reducing: false }),
            label: t("step.split.mapping", {
              done: summaries.length,
              total: chunks.length,
            }),
          },
        });

        try {
          const result = await streamChat({
            requestId: crypto.randomUUID(),
            system: t("mapReduce.mapTask"),
            messages: [{ role: "user", content: mapInstruction(chunk, chunks.length) }],
            maxTokens: 2000,
          });
          inputTokensPre += result.usage?.input ?? 0;
          outputTokensPre += result.usage?.output ?? 0;
          summaries.push({ index: chunk.index, heading: chunk.heading, text: result.text });
        } catch {
          // 1 チャンク落ちても残りで続ける（全部落とすより情報が残る）
        }
      }

      if (summaries.length > 0) {
        patch(ticker, {
          splitProgress: {
            ratio: splitProgress({ mapped: summaries.length, total: chunks.length, reducing: true }),
            label: t("step.split.reducing"),
          },
        });
        // 本文を抜き出しへ差し替える。ここから先は通常の 4 段が走る
        documents[i] = { name: doc.name, text: reduceSource(summaries) };
        splitCount = Math.max(splitCount, summaries.length);
      }
    }
    patch(ticker, { splitProgress: null });

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
          year: options.targetPeriod?.year ?? null,
          quarter: options.targetPeriod?.quarter ?? null,
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
        /*
         * **期を指定していたのに見つからなかった場合は分析を止める。**
         * 黙って別の期の書類で続けると、頼んだ期の分析として
         * 違う期の中身が保存される。
         */
        /*
         * **添付資料があるなら、SEC が取れなくても止めない。**
         * PDF と財務データだけで分析は成立する。
         * 期の指定はユーザーが「その期の資料」を入れている意思表示なので、
         * SEC 側の未提出を理由に中断すると、手元にある資料を使えないまま終わる。
         */
        if (options.targetPeriod && documents.length === 0) {
          const key = `FY${options.targetPeriod.year}${
            options.targetPeriod.quarter ? `-Q${options.targetPeriod.quarter}` : ""
          }`;
          pushToast(
            "warning",
            t("toast.analysis.periodNotFound"),
            t("toast.analysis.periodNotFoundWhy", { key }),
          );
          patch(ticker, { phase: "idle", requestId: null });
          return;
        }
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
    if (splitCount > 0) basis.push(t("basis.splitDocument", { count: splitCount }));
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

    /*
     * --- 生成（4 段を直列に）--------------------------------------
     *
     * **20 項目を一度に書かせない。** 出力上限で切れると、
     * そこまでの生成がまるごと無駄になり、保存も走らない。
     * 段ごとに確定させ、終わるたびに DB へ置いておく。
     */
    // やり直しなら、読む前に捨てる（壊れた段を土台にしない）
    if (options.fresh) await clearCheckpoints(ticker);

    const saved = options.fresh ? [] : await loadCheckpoints(ticker);
    const keep = usableSteps(saved.map((s) => s.step));
    const parts = saved
      .filter((s) => keep.includes(s.step))
      .map((s) => ({ id: s.step, raw: s.raw }));

    let inputTokens = inputTokensPre + parts.reduce((sum, _, i) => sum + (saved[i]?.inputTokens ?? 0), 0);
    let outputTokens = outputTokensPre + parts.reduce((sum, _, i) => sum + (saved[i]?.outputTokens ?? 0), 0);

    if (parts.length > 0) {
      pushToast("info", t("step.resumed", { done: parts.length }), "");
      patch(ticker, {
        completedSteps: parts.length,
        raw: mergeSteps(parts),
        result: parseAnalysis(mergeSteps(parts)),
      });
    }

    let cancelled = false;
    for (;;) {
      const step = nextStep(parts.map((p) => p.id));
      if (!step) break;

      patch(ticker, {
        phase: "streaming",
        // 最初の 1 文字が来たら段の名前へ切り替わる
        currentStepLabel: t("step.reasoning"),
        completedSteps: parts.length,
      });

      /*
       * **採点段には直前の出力を渡さない。**
       * 段を追うごとに前段の本文が積み上がり、資料と合わせて
       * 10 万トークンを超えて切断されていた。
       * 最終段だけは矛盾を見るために評価テーブルの行を渡す。
       */
      const context = step.range === null ? scoreRowsOnly(mergeSteps(parts)) : "";
      let stepRaw = "";
      /*
       * **推論モデルは考えている間、1 文字も返さない。**
       * 段の名前だけ出ていると止まったように見えるので、
       * 最初の 1 文字が来るまで「思考中」と伝える。
       */
      let started = false;
      const result = await streamChat(
        {
          requestId,
          // 役割 ID と閾値だけを渡す。秘匿プロンプトとの結合は Rust 側で行う
          /*
           * **不一致の禁止事項は第 1 段だけ、システムプロンプトの冒頭へ。**
           * ここで止まれば以降の段は走らないので、無駄なトークンを使わない。
           */
          analysisPreset: {
            roleId,
            thresholds,
            ...(step.id === ANALYSIS_STEPS[0].id ? { guardTicker: ticker } : {}),
          },
          messages: [
            { role: "user", content: prompt.user },
            { role: "user", content: stepInstruction(step, context) },
          ],
          maxTokens: RESERVE_FOR_OUTPUT,
        },
        {
          onStart: (provider, model) => patch(ticker, { provider, model }),
          onDelta: (delta) => {
            if (!started) {
              started = true;
              patch(ticker, { currentStepLabel: t(step.labelKey) });
            }
            stepRaw += delta;
            const merged = mergeSteps([...parts, { id: step.id, raw: stepRaw }]);
            patch(ticker, { raw: merged, result: parseAnalysis(merged) });
          },
        },
      );

      inputTokens += result.usage?.input ?? 0;
      outputTokens += result.usage?.output ?? 0;

      /*
       * --- 出力上限で切れたら、続きを取りに行く -------------------
       *
       * **切れたまま終わらせない。** 評価テーブルが途中で止まると
       * パーサが行を拾えず、その回の分析がまるごと使えなくなる。
       * 上限は 3 回。それでも終わらないなら、1 回に詰め込みすぎている
       * （分割の対象）と考えるほうが正しい。
       */
      let merged = result.text || stepRaw;
      for (let attempt = 0; result.truncated && canContinue(attempt); attempt += 1) {
        patch(ticker, {
          currentStepLabel: t("step.continuing", {
            attempt: attempt + 1,
            max: MAX_CONTINUATIONS,
          }),
        });

        const more = await streamChat(
          {
            requestId,
            analysisPreset: { roleId, thresholds },
            messages: [
              { role: "user", content: prompt.user },
              { role: "user", content: stepInstruction(step, context) },
              { role: "user", content: continuationPrompt(merged) },
            ],
            maxTokens: RESERVE_FOR_OUTPUT,
          },
          {
            onDelta: (delta) => {
              const preview = joinContinuation(merged, delta);
              const view = mergeSteps([...parts, { id: step.id, raw: preview }]);
              patch(ticker, { raw: view, result: parseAnalysis(view) });
            },
          },
        );

        inputTokens += more.usage?.input ?? 0;
        outputTokens += more.usage?.output ?? 0;
        merged = joinContinuation(merged, more.text);
        if (more.cancelled) break;
        if (!more.truncated) break;
      }


      // **中断されたら、その段は確定させない。** 途中までの行を保存すると、
      // 次に再開したときに欠けた表を土台にしてしまう
      if (result.cancelled) {
        cancelled = true;
        break;
      }

      parts.push({ id: step.id, raw: merged });
      await saveCheckpoint(ticker, step.id, merged, result.usage);
      patch(ticker, {
        completedSteps: parts.length,
        inputTokens,
        outputTokens,
      });
    }

    const finalRaw = mergeSteps(parts);
    const complete = parts.length === ANALYSIS_STEPS.length;

    /*
     * **中断でも記録する。** そこまでのトークンは実際に払っているので、
     * 完走したものだけ数えると請求額と噛み合わない。
     */
    void appendUsageLog({
      ticker,
      provider: runs[ticker]?.provider ?? null,
      model: runs[ticker]?.model ?? null,
      roleId,
      inputTokens,
      outputTokens,
      status: cancelled ? "cancelled" : "done",
      startedAtMs,
    });
    patch(ticker, {
      phase: cancelled ? "cancelled" : "done",
      cancelling: false,
      raw: finalRaw,
      result: parseAnalysis(finalRaw),
      requestId: null,
      currentStepLabel: null,
      inputTokens,
      outputTokens,
      finishedAtMs: Date.now(),
    });

    // 最後まで通ったら途中経過は捨てる（次回は最初から走る）
    if (complete) await clearCheckpoints(ticker);

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
          // 実測の消費トークン。コスト表示と履歴に残す
          inputTokens,
          outputTokens,
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
    /*
     * **原因を切り分けて残す。** 429（待てば直る）と 401（キーが違う）で
     * やることが正反対なので、「通信に失敗しました」だけでは動きようがない。
     * ここまでに確定した段は DB に残っているので、再開すれば続きから進む。
     */
    const info = diagnose(e);
    // 失敗した実行も記録する（そこまでの消費は発生している）
    void appendUsageLog({
      ticker,
      provider: runs[ticker]?.provider ?? null,
      model: runs[ticker]?.model ?? null,
      roleId: getActiveRoleId(),
      inputTokens: runs[ticker]?.inputTokens ?? 0,
      outputTokens: runs[ticker]?.outputTokens ?? 0,
      status: "error",
      startedAtMs,
    });
    patch(ticker, {
      phase: "error",
      cancelling: false,
      error: info.title,
      diagnosis: info,
      requestId: null,
      currentStepLabel: null,
      finishedAtMs: Date.now(),
    });
    toastError(info.title, info.action);
  }
}

/** 実行中の分析を中断する。 */
export async function cancelAnalysis(ticker: string): Promise<void> {
  const run = runs[ticker];
  if (!run?.requestId) return;
  // **二度目以降は何もしない。** 連打で余計な呼び出しを積まない
  if (run.cancelling) return;

  // 先に立てる。通信の往復を待ってから無効化すると、その間に押せてしまう
  patch(ticker, { cancelling: true });
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
  /*
   * **途中経過も一緒に捨てる。** 結果だけ消して段を残すと、
   * 次に走らせたときに消したはずの内容を土台にしてしまう。
   */
  await clearCheckpoints(ticker);
  try {
    await invoke("analysis_delete", { ticker });
    pushToast("info", t("toast.analysis.deleted", { ticker }));
  } catch (e) {
    toastError(t("toast.analysis.deleteFailed"), e);
  }
}
