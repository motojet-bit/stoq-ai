import { t } from "@/lib/i18n/i18n";

/**
 * 20 項目の生成を 4 段に分けて直列実行するための定義。
 *
 * **一度に 20 項目を書かせると出力上限で切れる。**
 * 途中で切れると、そこまでの生成がまるごと無駄になり、
 * 保存も走らないので「分析したのに何も残らない」状態になる。
 * 段ごとに確定させれば、切れても次はその続きから始められる。
 */

/** 1 段ぶんの定義。 */
export interface AnalysisStep {
  /** 1 始まりの通し番号。**保存キーになるので値を変えない** */
  id: number;
  /** 担当する評価項目の範囲（両端を含む）。最終段は採点しないので null */
  range: { from: number; to: number } | null;
  /** 進捗表示のラベルを引く辞書キー */
  labelKey: string;
}

/**
 * 段の区切り。
 *
 * 7 / 7 / 6 に割ってあるのは、1 段あたりの出力が
 * だいたい同じ長さに収まるようにするため。
 * 最終段は採点ではなく全体の見直し（死角チェック）に充てる。
 */
export const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: 1, range: { from: 1, to: 7 }, labelKey: "step.label.1" },
  { id: 2, range: { from: 8, to: 14 }, labelKey: "step.label.2" },
  { id: 3, range: { from: 15, to: 20 }, labelKey: "step.label.3" },
  { id: 4, range: null, labelKey: "step.label.4" },
];

/** 進捗メーターの段数。準備段（0）＋ 生成 4 段。 */
export const PROGRESS_STAGES = ANALYSIS_STEPS.length + 1;

/** 完了済みの段から、次に走らせる段を決める。 */
export function nextStep(doneStepIds: number[]): AnalysisStep | null {
  const done = new Set(doneStepIds);
  return ANALYSIS_STEPS.find((s) => !done.has(s.id)) ?? null;
}

/**
 * 保存済みの段が「そのまま使えるか」を判定する。
 *
 * **歯抜けは信用しない。** 1 と 3 だけが残っている状態から 2 を足しても、
 * 3 は 2 を読まずに書かれているので、通しで読むと辻褄が合わない。
 * 先頭から連続している分だけを再開の土台にする。
 */
export function usableSteps(doneStepIds: number[]): number[] {
  const done = new Set(doneStepIds);
  const usable: number[] = [];
  for (const step of ANALYSIS_STEPS) {
    if (!done.has(step.id)) break;
    usable.push(step.id);
  }
  return usable;
}

/** 進捗率（0〜1）。準備段を 1 つ分として数える。 */
export function progressRatio(completedSteps: number, running: boolean): number {
  const base = (completedSteps + 1) / PROGRESS_STAGES;
  // 走っている間は次の段の途中まで進んで見える（止まって見えると不安になる）
  const bonus = running ? 0.5 / PROGRESS_STAGES : 0;
  return Math.min(1, base + bonus);
}

/**
 * 採点段（1〜3）に渡す本文だけを抜き出す。
 *
 * **最終段は評価テーブルの行だけを読めばよい。**
 * 段ごとの前置きや強み・リスクまで渡すと、
 * 見直しに要らないものが入力トークンを食う。
 */
export function scoreRowsOnly(merged: string): string {
  return merged
    .split("\n")
    .filter((line) => /^\s*\|\s*\d+\s*\|/.test(line))
    .join("\n");
}

/**
 * 各段の指示文。
 *
 * **採点段（1〜3）には直前の出力を渡さない。**
 * 段を追うごとに前段の本文がプロンプトへ積み上がり、
 * 最後には資料と合わせて 10 万トークンを超えて切断されていた。
 * 各段は「一次資料 ＋ 財務データ」だけを見て、担当範囲を独立に採点する。
 * 通しの体裁は最後にフロント側で組み立てる。
 *
 * **最終段だけは評価テーブルの行を渡す。**
 * 矛盾の指摘と死角チェックは、何が書かれたかを読まないと成立しない。
 * 渡すのは表の行だけで、前置きや途中の節は落とす。
 */
export function stepInstruction(step: AnalysisStep, scoredRows: string): string {
  if (step.range === null) {
    return [
      t("prompt.step.previousHeading"),
      scoredRows.trim(),
      "",
      t("prompt.step.taskHeading"),
      t("prompt.step.finalTask"),
      "",
      t("prompt.step.finalSections"),
      "",
      t("prompt.step.blindSpotHeading"),
      t("prompt.step.blindSpotMissing"),
      t("prompt.step.blindSpotConflict"),
    ].join("\n");
  }

  const { from, to } = step.range;
  return [
    t("prompt.step.rangeTask", { from, to, count: to - from + 1 }),
    "",
    t("prompt.step.ruleNoHeader"),
    t("prompt.step.ruleIndependent"),
    t("prompt.step.ruleNoSections"),
  ].join("\n");
}

/**
 * 段ごとの出力を 1 本の分析本文に組み立てる。
 *
 * **テーブルのヘッダーはここで足す。** 各段には本文の行だけを書かせているので、
 * 素で連結するとヘッダーの無い表になり、パーサが 1 行も拾えない。
 */
export function mergeSteps(parts: { id: number; raw: string }[]): string {
  const byId = new Map(parts.map((p) => [p.id, p.raw.trim()]));
  const rows = ANALYSIS_STEPS.filter((s) => s.range !== null)
    .map((s) => byId.get(s.id) ?? "")
    .filter((v) => v !== "")
    .map(stripTableHeader)
    .join("\n");

  const tail = byId.get(ANALYSIS_STEPS[ANALYSIS_STEPS.length - 1].id) ?? "";

  const table =
    rows === "" ? "" : [t("prompt.step.tableHeading"), "", tableHeader(), rows].join("\n");
  return [table, tail].filter((v) => v.trim() !== "").join("\n\n");
}

/** 表のヘッダー。**辞書から引く**（列名は出力言語に揃える必要がある） */
const tableHeader = () =>
  `${t("prompt.step.tableHeader")}\n| --- | --- | --- | --- | --- |`;

/**
 * モデルがヘッダー行も返してきた場合に落とす。
 *
 * 「出力しない」と指示しても付けてくることがあり、
 * 残すと表の途中にヘッダーが挟まってパーサが行を取り違える。
 */
function stripTableHeader(block: string): string {
  return block
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return false;
      if (/^\|\s*-{2,}/.test(trimmed)) return false;
      if (/^\|\s*#\s*\|/.test(trimmed)) return false;
      if (/^##\s/.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}
