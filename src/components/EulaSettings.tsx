import { useState } from "react";
import { revokeEula, useEulaStatus } from "@/lib/legal/eulaStore";
import { agreedAtLabel, eulaClauses } from "@/lib/legal/eula";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useT } from "@/lib/i18n/i18n";

/**
 * 同意内容の確認と撤回。
 *
 * **撤回してもライセンスは失効させない。** 同意はアプリを使う条件であって、
 * 買ったライセンスを取り上げる理由にはならない。撤回すると
 * その場で `EulaModal` が前面に戻り、再び同意するまで操作できなくなる。
 */
export default function EulaSettings() {
  const status = useEulaStatus();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  const when = agreedAtLabel(status?.agreedAtMs ?? 0);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="t-body font-medium text-slate-200">{t("eula.settingsTitle")}</h3>
          {when && (
            <p className="mt-0.5 t-label text-slate-500">{t("eula.agreedAt", { when })}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="min-h-8 rounded-md border border-slate-700 px-3 t-label text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            {expanded ? t("eula.hide") : t("eula.view")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!status?.agreed}
            className="min-h-8 rounded-md border border-slate-700 px-3 t-label text-slate-400 transition-colors hover:border-red-800 hover:text-red-300 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            {t("eula.revoke")}
          </button>
        </div>
      </div>

      {expanded && (
        <ol className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          {eulaClauses().map((clause, i) => (
            <li key={clause.id}>
              <h4 className="t-label font-medium text-slate-300">
                {i + 1}. {clause.title}
              </h4>
              <p className="selectable mt-0.5 t-label leading-relaxed text-slate-500">
                {clause.body}
              </p>
            </li>
          ))}
        </ol>
      )}

      {/* 撤回するとアプリが使えなくなるので確認を挟む */}
      <ConfirmDialog
        open={confirming}
        title={t("eula.revokeConfirmTitle")}
        message={t("eula.revokeConfirmBody")}
        confirmLabel={t("eula.revokeConfirm")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          setConfirming(false);
          void revokeEula();
        }}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
