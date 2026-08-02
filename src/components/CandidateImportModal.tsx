import { useEffect, useMemo, useState } from "react";
import { parseCandidates } from "@/lib/candidates/parseCandidates";
import { addCandidates } from "@/lib/candidates/candidateStore";
import { IconBookmark } from "@/components/Icons";
import ModalShell from "@/components/ModalShell";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 検討中銘柄の一括インポート。
 *
 * 貼り付けた内容は保存前に解析結果として見せる。
 * **取り込めなかった行を黙って捨てると、貼ったのに入っていないことに気づけない。**
 */
export default function CandidateImportModal({ open, onClose }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setText("");
  }, [open]);

  const result = useMemo(() => parseCandidates(text), [text]);

  const submit = async () => {
    if (result.items.length === 0) return;
    setBusy(true);
    try {
      await addCandidates(result.items);
      onClose();
    } catch {
      // トーストで通知済み。モーダルは開いたままにして貼り直せるようにする
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title={t("import.title")}
      icon={<IconBookmark className="h-4 w-4 text-emerald-400" />}
      maxWidthClass="max-w-2xl"
      onClose={onClose}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-end gap-2 border-t border-slate-800 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || result.items.length === 0}
            className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy ? t("settings.saving") : t("import.addCount", { count: result.items.length })}
          </button>
        </footer>
      }
    >
        <div className="px-4 py-4">
          <label className="block">
            <span className="mb-1.5 block t-body text-slate-300">
              {t("import.instructions")}
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={10}
              placeholder={t("import.placeholder")}
              aria-label={t("import.aria")}
              className="selectable w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono t-body leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <p className="mt-1.5 t-label leading-relaxed text-slate-500">
            {t("import.note")}
          </p>

          {text.trim().length > 0 && (
            <div className="mt-4 space-y-3">
              <div>
                <h3 className="mb-1.5 t-label font-medium uppercase tracking-wider text-slate-500">
                  取り込む銘柄（{result.items.length} 件）
                </h3>
                {result.items.length === 0 ? (
                  <p className="t-label text-slate-600">{t("import.nothing")}</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-slate-800">
                    <table className="w-full">
                      <tbody>
                        {result.items.map((item) => (
                          <tr key={item.ticker} className="border-b border-slate-800/70 last:border-0">
                            <td className="w-24 px-2 py-1 font-mono t-label text-emerald-300">
                              {item.ticker}
                            </td>
                            <td className="px-2 py-1 t-label text-slate-300">{item.name || t("common.none")}</td>
                            <td className="w-32 px-2 py-1 t-label text-slate-500">
                              {item.genre || t("common.none")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {result.duplicates.length > 0 && (
                <p className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 t-label text-slate-400">
                  入力内で重複していたため、後の行を採用しました:{" "}
                  <span className="font-mono text-slate-200">
                    {result.duplicates.join(", ")}
                  </span>
                </p>
              )}

              {result.errors.length > 0 && (
                <div className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2">
                  <p className="mb-1 t-label font-medium text-amber-300">
                    取り込めない行が {result.errors.length} 件あります
                  </p>
                  <ul className="space-y-0.5">
                    {result.errors.map((err) => (
                      <li key={err.line} className="selectable t-label text-amber-200/90">
                        {err.line} 行目: {err.reason}
                        <span className="ml-1 font-mono text-amber-200/60">「{err.text}」</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
    </ModalShell>
  );
}
