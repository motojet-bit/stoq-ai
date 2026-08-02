import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import { saveSettings } from "@/lib/config/settingsStore";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import {
  CUSTOM_INSTRUCTION_HINT,
  MAX_CUSTOM_INSTRUCTION,
  customInstructionError,
} from "@/lib/prompts/customInstruction";
import Tooltip from "@/components/Tooltip";
import { IconHelp } from "@/components/Icons";

interface Props {
  settings: AppSettings | null;
}

/**
 * 分析への追加指示（自由記述）。
 *
 * **基本プロンプトは見せない。** ここで入力した文だけが Rust 側で
 * 秘匿プロンプトの末尾に結合され、LLM へ送られる。
 * 画面にもフロントのコードにも、基本プロンプトの本文は現れない。
 */
export default function CustomInstructionSettings({ settings }: Props) {
  const [draft, setDraft] = useState(settings?.customInstruction ?? "");
  const [busy, setBusy] = useState(false);

  // 設定が読み込み直されたら追従する
  useEffect(() => {
    setDraft(settings?.customInstruction ?? "");
  }, [settings?.customInstruction]);

  const saved = settings?.customInstruction ?? "";
  const dirty = draft.trim() !== saved.trim();
  const error = customInstructionError(draft);

  const save = async () => {
    setBusy(true);
    try {
      await saveSettings({ customInstruction: draft });
      toastSuccess("カスタム指示を保存しました");
    } catch (e) {
      toastError("カスタム指示を保存できませんでした", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <h3 className="t-body font-medium text-slate-200">カスタム指示（自由記述）</h3>
          <Tooltip content={CUSTOM_INSTRUCTION_HINT} placement="top">
            <span
              tabIndex={0}
              aria-label={CUSTOM_INSTRUCTION_HINT}
              className="flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-slate-500 hover:text-emerald-300"
            >
              <IconHelp className="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        </span>
        <span className="shrink-0 font-mono t-label text-slate-600">
          {draft.trim().length} / {MAX_CUSTOM_INSTRUCTION}
        </span>
      </div>

      <p className="mb-2 t-label leading-relaxed text-slate-500">
        プリセット（分析役割）に足したい観点があれば書いてください。
        アプリ内蔵の分析プロンプトはそのまま使われ、この文だけが末尾に追加されます。
      </p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        spellCheck={false}
        placeholder="例: 半導体サイクルの底打ち時期に注目し、在庫水準の推移を重点的に評価してください。"
        className="selectable w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 t-label leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
      />

      {error && (
        <p className="mt-1 t-label leading-relaxed text-amber-400">{error}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="t-label text-slate-600">
          {saved.trim() === "" ? "未設定（プリセットのみ）" : "設定済み"}
        </span>
        <div className="flex shrink-0 gap-2">
          {saved.trim() !== "" && (
            <button
              type="button"
              onClick={() => setDraft("")}
              className="min-h-8 rounded-md border border-slate-700 px-3 t-label text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
            >
              クリア
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty || error !== null}
            className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </section>
  );
}
