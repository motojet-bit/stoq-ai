import {
  dismissUpdate,
  downloadAndInstall,
  restartApp,
  useUpdateState,
} from "@/lib/update/updateStore";
import { APP_VERSION } from "@/lib/ui/appMeta";
import ModalShell from "@/components/ModalShell";
import { IconRestore } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

/**
 * 新しいバージョンの案内。
 *
 * **出すのは「見つかったとき」だけ。** 起動のたびに何か出ると、
 * 変わっていないのに毎回操作を求められているように感じる。
 * 確認中や「最新です」はここでは出さない（設定画面とトーストに任せる）。
 */
export default function UpdateModal() {
  const update = useUpdateState();
  const t = useT();

  const visible =
    update.phase === "available" ||
    update.phase === "downloading" ||
    update.phase === "ready";
  if (!visible) return null;

  const ready = update.phase === "ready";
  const busy = update.phase === "downloading";

  return (
    <ModalShell
      open
      title={ready ? t("update.readyTitle") : t("update.title", { version: update.version ?? "" })}
      icon={<IconRestore className="h-4 w-4 text-emerald-400" />}
      maxWidthClass="max-w-lg"
      onClose={dismissUpdate}
      footer={
        <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-4 py-2">
          <button
            type="button"
            onClick={dismissUpdate}
            disabled={busy}
            className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            {ready ? t("update.restartLater") : t("update.later")}
          </button>
          <button
            type="button"
            onClick={() => void (ready ? restartApp() : downloadAndInstall())}
            disabled={busy}
            className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy
              ? t("update.downloading", { progress: update.progress })
              : ready
                ? t("update.restart")
                : t("update.install")}
          </button>
        </footer>
      }
    >
      <div className="px-6 py-5">
        <p className="selectable t-body leading-relaxed text-slate-300">
          {ready ? t("update.readyBody") : t("update.body", { current: APP_VERSION })}
        </p>

        {!ready && update.notes && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
            <p className="mb-1.5 t-label font-medium uppercase tracking-wider text-slate-500">
              {t("update.notesTitle")}
            </p>
            <p className="selectable whitespace-pre-wrap t-label leading-relaxed text-slate-400">
              {update.notes}
            </p>
          </div>
        )}

        {update.error && (
          <p className="selectable mt-3 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 t-label leading-relaxed text-red-300">
            {update.error}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
