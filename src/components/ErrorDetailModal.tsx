import { useState } from "react";
import type { Diagnosis } from "@/lib/errors/diagnose";
import ModalShell from "@/components/ModalShell";
import { IconWarning } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  open: boolean;
  diagnosis: Diagnosis | null;
  /** 発生時の状況（銘柄・プロバイダ・モデル・段）。問い合わせのときに要る */
  context: {
    ticker: string | null;
    provider: string | null;
    model: string | null;
    completedSteps: number;
  };
  onClose: () => void;
}

/**
 * エラーの生ログを見せるモーダル。
 *
 * **そのままコピーできる形にする。** 問い合わせを受ける側が最初に聞くのは
 * 「実際のメッセージ」と「どのモデルで起きたか」で、
 * 画面の文言だけでは切り分けられない。
 * 貼り付ければ状況が揃うよう、発生時の環境も一緒に出す。
 */
export default function ErrorDetailModal({ open, diagnosis, context, onClose }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  if (!diagnosis) return null;

  const report = [
    `kind: ${diagnosis.kind}`,
    `ticker: ${context.ticker ?? "-"}`,
    `provider: ${context.provider ?? "-"}`,
    `model: ${context.model ?? "-"}`,
    `completedSteps: ${context.completedSteps}`,
    "",
    diagnosis.detail,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      // 「コピーしました」を出しっぱなしにしない
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピーできなくても本文は選択できる（selectable を付けてある）
    }
  };

  return (
    <ModalShell
      open={open}
      title={t("diagnose.modalTitle")}
      icon={<IconWarning className="h-4 w-4 text-red-400" />}
      maxWidthClass="max-w-2xl"
      onClose={onClose}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="t-label text-slate-600">{t("diagnose.modalHint")}</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500"
            >
              {copied ? t("diagnose.copied") : t("diagnose.copy")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-8 rounded-md border border-slate-700 px-4 t-body text-slate-300 transition-colors hover:bg-slate-800"
            >
              {t("settings.close")}
            </button>
          </div>
        </footer>
      }
    >
      <div className="px-4 py-3">
        <p className="t-body font-medium text-red-300">{diagnosis.title}</p>
        <p className="mt-1.5 t-label leading-relaxed text-slate-400">{diagnosis.action}</p>

        <h3 className="mt-4 mb-1.5 t-label font-medium uppercase tracking-wider text-slate-500">
          {t("diagnose.rawLog")}
        </h3>
        <pre className="selectable max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 t-label leading-relaxed text-slate-300">
          {report}
        </pre>
      </div>
    </ModalShell>
  );
}
