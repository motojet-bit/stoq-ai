import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import { saveSettings } from "@/lib/config/settingsStore";
import { toastError } from "@/lib/ui/toastStore";
import {
  buildThresholdSection,
  clampThreshold,
  customizedIds,
  formatRule,
  mergeThresholds,
  THRESHOLDS,
  type ThresholdValues,
} from "@/lib/prompts/thresholds";
import { TOOLTIPS } from "@/lib/ui/tooltipText";
import Tooltip from "@/components/Tooltip";
import { IconHelp } from "@/components/Icons";

interface Props {
  settings: AppSettings | null;
}

/**
 * AI の合否判定に使う閾値のカスタマイズ。
 *
 * 設定した数値はそのままシステムプロンプトに埋め込まれるので、
 * **実際に送られる文面をその場で確認できる**ようにしている。
 */
export default function ThresholdSettings({ settings }: Props) {
  const [values, setValues] = useState<ThresholdValues>(() =>
    mergeThresholds(settings?.thresholds),
  );
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  // 設定が読み込み直されたら追従する
  useEffect(() => {
    setValues(mergeThresholds(settings?.thresholds));
  }, [settings?.thresholds]);

  const changed = customizedIds(values);

  const persist = async (next: ThresholdValues) => {
    setBusy(true);
    try {
      // 既定と同じ項目は保存しない（既定を変えたときに古い値が残らないように）
      const diff: ThresholdValues = {};
      for (const id of customizedIds(next)) diff[id] = next[id];
      await saveSettings({ thresholds: diff });
    } catch (e) {
      toastError("閾値を保存できませんでした", e);
    } finally {
      setBusy(false);
    }
  };

  const update = (id: string, raw: number) => {
    const def = THRESHOLDS.find((t) => t.id === id);
    if (!def) return;
    const next = { ...values, [id]: clampThreshold(def, raw) };
    setValues(next);
    void persist(next);
  };

  const resetAll = () => {
    const next = mergeThresholds(null);
    setValues(next);
    void persist(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="t-label leading-relaxed text-slate-500">
          AI が合格/不合格を判定する基準です。設定した数値は
          <strong className="text-slate-300">そのままシステムプロンプトに埋め込まれ</strong>、
          各項目の根拠欄に「基準に対して合格か」が明記されます。
        </p>
        <Tooltip content={TOOLTIPS.thresholds} placement="left">
          <span className="shrink-0 text-slate-600">
            <IconHelp className="h-4 w-4" />
          </span>
        </Tooltip>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        {THRESHOLDS.map((def) => {
          const value = values[def.id];
          const isChanged = value !== def.defaultValue;

          return (
            <div
              key={def.id}
              className="border-b border-slate-800/80 px-3 py-2.5 last:border-0 odd:bg-slate-900/40"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="t-body font-medium text-slate-200">{def.label}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 font-mono t-label ${
                        isChanged
                          ? "bg-emerald-950/60 text-emerald-300"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {def.direction === "min" ? "≧" : "≦"} {value}
                      {def.unit}
                    </span>
                  </span>
                  <span className="mt-0.5 block t-label text-slate-500">{def.hint}</span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={value}
                    disabled={busy}
                    onChange={(e) => update(def.id, Number(e.target.value))}
                    aria-label={`${def.label} のスライダー`}
                    className="h-1 w-40 cursor-pointer accent-emerald-500"
                  />
                  <input
                    type="number"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={value}
                    disabled={busy}
                    onChange={(e) => update(def.id, Number(e.target.value))}
                    aria-label={`${def.label} の数値`}
                    className="selectable min-h-7 w-20 rounded-md border border-slate-700 bg-slate-950 px-2 text-right font-mono t-label text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-label text-slate-600">
          {changed.length === 0
            ? "すべて既定値です"
            : `${changed.length} 項目を既定から変更しています`}
        </span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
          >
            {showPrompt ? "送信文を隠す" : "AI に送る文面を見る"}
          </button>
          <button
            type="button"
            onClick={resetAll}
            disabled={changed.length === 0 || busy}
            className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            すべて既定に戻す
          </button>
        </div>
      </div>

      {showPrompt && (
        <pre className="selectable max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono t-label leading-relaxed text-slate-300">
          {buildThresholdSection(values)}
        </pre>
      )}

      {changed.length > 0 && (
        <p className="rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 t-label leading-relaxed text-slate-400">
          変更中: {changed.map((id) => {
            const def = THRESHOLDS.find((t) => t.id === id)!;
            return formatRule(def, values[id]);
          }).join(" / ")}
        </p>
      )}
    </div>
  );
}
