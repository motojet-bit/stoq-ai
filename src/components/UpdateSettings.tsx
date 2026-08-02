import { checkForUpdate, useUpdateState } from "@/lib/update/updateStore";
import { APP_VERSION } from "@/lib/ui/appMeta";
import { useT } from "@/lib/i18n/i18n";

/**
 * 設定画面から手動で更新を確かめる。
 *
 * 自動チェックは起動時に走るが、**「いま確かめたい」に応えられる口も要る**。
 * 自動チェックが静かに失敗していても、ここを押せば理由が出る。
 */
export default function UpdateSettings() {
  const update = useUpdateState();
  const t = useT();
  const busy = update.phase === "checking" || update.phase === "downloading";

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="t-body font-medium text-slate-200">{t("update.settingsTitle")}</h3>
          <p className="mt-0.5 t-label text-slate-500">
            {t("update.currentVersion", { version: APP_VERSION })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void checkForUpdate(true)}
          disabled={busy}
          className="min-h-8 shrink-0 whitespace-nowrap rounded-md border border-slate-600 px-3 t-body text-slate-200 transition-colors hover:border-emerald-700 hover:bg-slate-800 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("update.checking") : t("update.check")}
        </button>
      </div>

      <p className="mt-2 selectable t-label leading-relaxed text-slate-500">
        {t("update.settingsHint")}
      </p>

      {update.phase === "error" && update.error && (
        <p className="selectable mt-2 t-label leading-relaxed text-amber-400">{update.error}</p>
      )}
    </section>
  );
}
