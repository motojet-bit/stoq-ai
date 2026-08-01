import { useEffect, useState } from "react";
import { agreeEula, loadEula, useEulaBlocked } from "@/lib/legal/eulaStore";
import { eulaClauses } from "@/lib/legal/eula";
import ModalShell from "@/components/ModalShell";
import { IconBadge } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

/**
 * 初回起動時の免責同意。
 *
 * **閉じる手段を置かない。** 背景クリック・Esc・✕ のいずれでも消えず、
 * 同意ボタン以外に先へ進む道が無い状態にする。
 * ここを素通りできると、免責に同意しないまま分析結果を見られてしまい、
 * 法的な防衛線として意味をなさなくなる。
 *
 * 同意済みかどうかは Rust 側の設定ファイル（`eula_agreed`）が持つ。
 * 撤回された場合もこのモーダルが再び前面に出る。
 */
export default function EulaModal() {
  const blocked = useEulaBlocked();
  const [busy, setBusy] = useState(false);
  const t = useT();

  useEffect(() => {
    void loadEula();
  }, []);

  const handleAgree = async () => {
    setBusy(true);
    try {
      await agreeEula();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={blocked}
      title={t("eula.title")}
      icon={<IconBadge className="h-4 w-4 text-amber-400" />}
      maxWidthClass="max-w-2xl"
      blocking
      onClose={() => {
        // 同意するまで閉じられない
      }}
      footer={
        <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="min-w-0 flex-1 t-label leading-relaxed text-slate-500">
            {t("eula.note")}
          </span>
          <button
            type="button"
            onClick={() => void handleAgree()}
            disabled={busy}
            className="min-h-9 shrink-0 rounded-md bg-emerald-600 px-5 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy ? t("eula.agreeing") : t("eula.agree")}
          </button>
        </footer>
      }
    >
      <div className="px-6 py-5">
        <p className="selectable t-body leading-relaxed text-slate-300">{t("eula.lead")}</p>

        <ol className="mt-4 space-y-3">
          {eulaClauses().map((clause, i) => (
            <li
              key={clause.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5"
            >
              <h3 className="t-body font-medium text-slate-100">
                {i + 1}. {clause.title}
              </h3>
              <p className="selectable mt-1 t-label leading-relaxed text-slate-400">
                {clause.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </ModalShell>
  );
}
