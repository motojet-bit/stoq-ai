import { useEffect, useState } from "react";
import { MODAL_OVERLAY_CLASS } from "@/lib/ui/modalDrag";
import { periodKey, type FiscalPeriod } from "@/lib/parser/fiscalPeriod";
import { branchLabel } from "@/lib/portfolio/archiveTree";
import { useT } from "@/lib/i18n/i18n";
import type { ArchiveEntry } from "@/types";

/** 選べる四半期。`null` は通期。 */
const QUARTERS: (1 | 2 | 3 | 4 | null)[] = [1, 2, 3, 4, null];

interface Props {
  open: boolean;
  /**
   * `document` = 添付資料の期を確認する / `noDocument` = 分析対象の期を選ぶ。
   * **後者は「最新期」を既定にする。** 過去を掘るのは意図がある人だけ。
   */
  mode?: "document" | "noDocument";
  /** 自動特定できた決算期。判別できなければ null */
  detected: FiscalPeriod | null;
  /** 判定に使った資料の名前 */
  documentName: string | null;
  /**
   * 期の違う資料が複数見つかったときの候補。
   * **1 件以下なら絞り込みは出さない。**
   */
  candidates?: { period: FiscalPeriod; documents: string[] }[];
  /**
   * この期の本体としてすでに保存済みの分析。
   * あれば「期中の追加分析として記録する」を選べるようにする。
   */
  existing: ArchiveEntry | null;
  /** 既存の下にぶら下がっている件数（枝番の予告に使う） */
  existingChildCount: number;
  /** `fiscalYear` が null なら「最新期」を意味する */
  onConfirm: (
    fiscalYear: number | null,
    quarter: 1 | 2 | 3 | 4 | null,
    parentId: string | null,
  ) => void;
  onCancel: () => void;
}

/**
 * 自動特定した決算期をユーザーに確認・修正させるダイアログ。
 *
 * **自動特定は「読み取れたが間違っている」ことがある。**
 * 決算資料には前年同期や中期計画の年度も書かれているので、
 * 表紙の書式が変わっていると別の期を掴むことがあり、これは機械では検出できない。
 * 期を取り違えると当時の株価として別の期の数値が突き合わされ、
 * 分析自体は成立してしまうので、出力を読んでも間違いに気づけない。
 *
 * **判別できなかったときも同じダイアログを出す。**
 * 「分かりませんでした、選んでください」と聞けば期を記録できる。
 */
export default function FiscalPeriodDialog({
  open,
  mode = "document",
  detected,
  documentName,
  candidates = [],
  existing,
  existingChildCount,
  onConfirm,
  onCancel,
}: Props) {
  const t = useT();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4 | null>(null);
  // 本体として上書きするか、期中の追加として下にぶら下げるか
  const [asAdhoc, setAsAdhoc] = useState(false);
  // 資料なしモードで、過去期を指定するか（既定は最新期）
  const [pickPast, setPickPast] = useState(false);
  // 期が複数見つかったときに選ばれているキー
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const multi = candidates.length > 1;

  // 開くたびに検出結果へ戻す（前回の修正を引きずらない）
  useEffect(() => {
    if (!open) return;
    setYear(detected?.fiscalYear ?? thisYear);
    setQuarter(detected?.quarter ?? null);
    // 既定は本体。上書きの意図が無いときだけ選び直してもらう
    setAsAdhoc(false);
    setPickPast(false);
    setPickedKey(candidates[0]?.period.key ?? null);
    // 複数見つかったときは先頭（最も新しい期）を初期選択にする
    if (candidates.length > 1) {
      setYear(candidates[0].period.fiscalYear);
      setQuarter(candidates[0].period.quarter);
    }
    // candidates は開いた瞬間の内容だけを見る（開いている間に増えない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detected, thisYear]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  // 修正されたかどうか。変えたことが分かるようにバッジで出す
  const changed =
    detected !== null && (year !== detected.fiscalYear || quarter !== detected.quarter);

  return (
    <div
      className={`ui-fixed fixed inset-0 z-100 flex items-center justify-center p-6 ${MODAL_OVERLAY_CLASS}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fiscal-period-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/60">
        <h2 id="fiscal-period-title" className="text-base font-semibold text-slate-100">
          {multi
            ? t("period.multiTitle")
            : mode === "noDocument"
              ? t("period.noDocTitle")
              : t("period.dialogTitle")}
        </h2>

        {/*
          **期の違う資料は混ぜない。** どの数字がどの期のものか
          分からない結果ができるので、1 つ選ばせてから走らせる。
        */}
        {multi && (
          <div className="mt-2">
            <p className="text-sm leading-relaxed text-slate-400">
              {t("period.multiBody", { count: candidates.length })}
            </p>
            <div className="mt-3 space-y-1.5">
              {candidates.map((c) => (
                <label
                  key={c.period.key}
                  className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                    pickedKey === c.period.key
                      ? "border-emerald-600 bg-emerald-950/30 text-slate-100"
                      : "border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    checked={pickedKey === c.period.key}
                    onChange={() => {
                      setPickedKey(c.period.key);
                      setYear(c.period.fiscalYear);
                      setQuarter(c.period.quarter);
                    }}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500"
                  />
                  <span className="min-w-0">
                    <span className="font-mono font-semibold text-emerald-300">
                      {c.period.key}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-600">
                      {c.documents.join(" / ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-600">{t("period.multiHint")}</p>
          </div>
        )}

        {multi ? null : mode === "noDocument" ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {t("period.noDocBody")}
            </p>
            <div className="mt-4 space-y-1.5">
              {[false, true].map((past) => (
                <label
                  key={String(past)}
                  className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                    pickPast === past
                      ? "border-emerald-600 bg-emerald-950/30 text-slate-100"
                      : "border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    checked={pickPast === past}
                    onChange={() => setPickPast(past)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500"
                  />
                  <span className="min-w-0">
                    {past ? t("period.past") : t("period.latest")}
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {past ? t("period.pastHint") : t("period.latestHint")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {detected ? (
            <>
              {t("period.detectedBody", {
                document: documentName ?? "-",
                key: detected.key,
              })}
              <span className="mt-1 block font-mono text-xs text-slate-600">
                {t("period.detectedFrom", { text: detected.matchedText })}
              </span>
              {detected.matchedBy === "fileName" && (
                <span className="mt-1 block text-xs text-amber-400/80">
                  {t("period.detectedFromName")}
                </span>
              )}
              {detected.matchedBy === "estimated" && (
                <span className="mt-1 block text-xs text-amber-400/80">
                  {t("period.estimated")}
                </span>
              )}
            </>
          ) : (
            t("period.unknownBody", { document: documentName ?? "-" })
          )}
        </p>
        )}

        {/* ------------------------------------------------ 年度 */}
        <div className={mode === "noDocument" && !pickPast ? "hidden" : ""}>
        <label className="mt-5 block">
          <span className="mb-1 block text-xs text-slate-500">{t("period.fiscalYear")}</span>
          <input
            type="number"
            value={year}
            min={1990}
            max={2100}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-32 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {/* ------------------------------------------------ 四半期 */}
        <div className="mt-4">
          <span className="mb-1 block text-xs text-slate-500">{t("period.quarter")}</span>
          <div className="flex flex-wrap gap-1.5">
            {QUARTERS.map((q) => (
              <button
                key={q ?? "fy"}
                type="button"
                onClick={() => setQuarter(q)}
                aria-pressed={quarter === q}
                className={`min-h-8 rounded-md border px-3 text-sm transition-colors ${
                  quarter === q
                    ? "border-emerald-500 bg-emerald-950/60 text-emerald-300"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                {q === null ? t("period.fullYear") : `Q${q}`}
              </button>
            ))}
          </div>
        </div>

        </div>

        {/* ------------------------------------------------ 確定内容 */}
        <p
          className={`mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-xs text-slate-400 ${
            mode === "noDocument" && !pickPast ? "hidden" : ""
          }`}
        >
          <span>{t("period.willRecordAs")}</span>
          <span className="font-mono text-sm font-semibold text-emerald-300">
            {periodKey(year, quarter)}
          </span>
          {changed && (
            <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-amber-300">
              {t("period.corrected")}
            </span>
          )}
        </p>

        {/* ------------------------------------------------ 資料の種類 */}
        {/*
          **既存の有無に関わらず選ばせる。** 見通し資料を本決算として記録すると、
          あとから実績と見分けが付かなくなる。
          ぶら下げ先が無いときは、親なしのアドホックとして残す。
        */}
        {mode === "document" && (
          <div className="mt-4">
            <span className="mb-1.5 block text-xs text-slate-500">{t("period.kind")}</span>
            <div className="space-y-1.5">
              {[false, true].map((adhoc) => (
                <label
                  key={String(adhoc)}
                  className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                    asAdhoc === adhoc
                      ? "border-emerald-600 bg-emerald-950/30 text-slate-100"
                      : "border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    checked={asAdhoc === adhoc}
                    onChange={() => setAsAdhoc(adhoc)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500"
                  />
                  <span className="min-w-0">
                    {adhoc ? t("period.kindAdhoc") : t("period.kindMain")}
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {adhoc
                        ? existing
                          ? t("period.asAdhoc", {
                              label: branchLabel(periodKey(year, quarter), existingChildCount + 1),
                            })
                          : t("period.kindAdhocHint")
                        : t("period.kindMainHint")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {asAdhoc && existing && (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {t("period.adhocHint")}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-9 rounded-md border border-slate-700 px-4 text-sm text-slate-300 transition-colors hover:bg-slate-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                // 最新期を選んだときは期を渡さない（Rust 側が最新を採る）
                mode === "noDocument" && !pickPast ? null : year,
                mode === "noDocument" && !pickPast ? null : quarter,
                asAdhoc ? (existing?.id ?? null) : null,
              )
            }
            className="min-h-9 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            {t("period.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
