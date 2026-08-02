import { useEffect, useState } from "react";
import {
  backup,
  connect,
  disconnect,
  loadCloudStatus,
  restore,
  setAutoBackup,
  setClientId,
  useCloudStatus,
} from "@/lib/cloud/cloudStore";
import {
  clientIdError,
  formatBytes,
  formatLastBackup,
  isBackupStale,
} from "@/lib/cloud/cloudBackup";
import CloudSyncGuide from "@/components/CloudSyncGuide";
import ConfirmDialog from "@/components/ConfirmDialog";
import { IconBadge } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

type Busy = "connect" | "backup" | "restore" | "clientId" | null;

/**
 * クラウド同期（Google Drive アプリ専用領域）の設定。
 *
 * **触れるのはアプリ専用の隠し領域だけ。** ユーザーのマイドライブ
 * （写真・書類など）には一切アクセスしない。そのことを画面でも明示する。
 */
export default function CloudSyncSettings() {
  const status = useCloudStatus();
  const [clientId, setClientIdDraft] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const t = useT();
  const now = Date.now();

  useEffect(() => {
    void loadCloudStatus();
  }, []);

  const idError = clientId.trim() === "" ? null : clientIdError(clientId);

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const handleSaveClientId = () =>
    run("clientId", async () => {
      if (await setClientId(clientId)) setClientIdDraft("");
    });

  const handleBackup = () =>
    run("backup", async () => {
      const result = await backup();
      if (result) {
        setLastResult(
          t("cloud.result.backup", {
            files: result.included.join(" / "),
            size: formatBytes(result.sizeBytes),
          }),
        );
      }
    });

  const handleRestore = () =>
    run("restore", async () => {
      const result = await restore();
      if (result) {
        setLastResult(
          t("cloud.result.restore", { files: result.restored.join(" / ") }),
        );
      }
    });

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------ 連携の状態 */}
      <div
        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
          status.connected
            ? "border-emerald-900/60 bg-emerald-950/25"
            : "border-slate-800 bg-slate-900/50"
        }`}
      >
        <IconBadge
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            status.connected ? "text-emerald-400" : "text-slate-600"
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="t-body font-medium text-slate-100">
              {status.connected ? t("cloud.status.connected") : t("cloud.status.disconnected")}
            </span>
            {status.clientIdMasked && (
              <span className="shrink-0 rounded bg-slate-800 px-1.5 font-mono t-label text-slate-300">
                {status.clientIdMasked}
              </span>
            )}
          </span>
          <span className="mt-0.5 block t-label leading-relaxed text-slate-500">
            {t("cloud.status.lastBackup", {
              when: formatLastBackup(status.lastBackupMs, now),
            })}
            {isBackupStale(status.lastBackupMs, now) && (
              <span className="ml-1 text-amber-400">{t("cloud.status.stale")}</span>
            )}
          </span>
        </span>
      </div>

      {/* ------------------------------------------------ 手順ガイド */}
      <CloudSyncGuide />

      {/* ------------------------------------------------ 触れる範囲の明示 */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
        <p className="mb-1 t-label font-medium text-slate-300">{t("cloud.scope.title")}</p>
        <p className="selectable t-label leading-relaxed text-slate-500">
          {t("cloud.scope.body")}
          <br />
          {t("cloud.scope.contents")}
        </p>
      </div>

      {/* ------------------------------------------------ クライアント ID */}
      <label className="block">
        <span className="mb-1 flex items-center justify-between gap-2 t-label text-slate-500">
          <span className="min-w-0 truncate">{t("cloud.clientId.label")}</span>
          <span className="shrink-0 whitespace-nowrap">
            {status.clientIdConfigured ? (
              <span className="text-emerald-400">{t("settings.key.configured")}</span>
            ) : (
              <span className="text-slate-600">{t("settings.key.unset")}</span>
            )}
          </span>
        </span>
        <div className="flex items-end gap-2">
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientIdDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              status.clientIdConfigured
                ? t("settings.key.changeOnly")
                : "000000000000-xxxxxxxx.apps.googleusercontent.com"
            }
            className="selectable min-h-9 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 font-mono t-label text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSaveClientId()}
            disabled={busy !== null || clientId.trim() === "" || idError !== null}
            className="min-h-9 shrink-0 whitespace-nowrap rounded-md border border-slate-700 px-3 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            {busy === "clientId" ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
        {idError && (
          <p className="selectable mt-1 t-label leading-relaxed text-amber-400">{idError}</p>
        )}
        <p className="mt-1 selectable t-label leading-relaxed text-slate-600">
          {t("cloud.clientId.help")}
        </p>
      </label>

      {/* ------------------------------------------------ 操作 */}
      <div className="flex flex-wrap gap-2">
        {status.connected ? (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={busy !== null}
            className="min-h-9 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-red-800 hover:text-red-300 disabled:cursor-not-allowed"
          >
            {t("cloud.disconnect")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run("connect", async () => void (await connect()))}
            disabled={busy !== null || !status.clientIdConfigured}
            className="min-h-9 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy === "connect" ? t("cloud.connecting") : t("cloud.connect")}
          </button>
        )}

        <button
          type="button"
          onClick={() => void handleBackup()}
          disabled={busy !== null || !status.connected}
          className="min-h-9 rounded-md border border-emerald-800 bg-emerald-950/40 px-3.5 t-body text-emerald-300 transition-colors hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-transparent disabled:text-slate-600"
        >
          {busy === "backup" ? t("cloud.backingUp") : t("cloud.backup")}
        </button>

        <button
          type="button"
          onClick={() => setConfirmRestore(true)}
          disabled={busy !== null || !status.connected}
          className="min-h-9 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
        >
          {busy === "restore" ? t("cloud.restoring") : t("cloud.restore")}
        </button>
      </div>

      {/* ------------------------------------------------ 自動バックアップ */}
      <label className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
        <input
          type="checkbox"
          checked={status.autoBackup}
          onChange={(e) => void setAutoBackup(e.target.checked)}
          disabled={!status.connected}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500 disabled:opacity-40"
        />
        <span className="min-w-0">
          <span className="block t-body text-slate-200">{t("cloud.autoBackup")}</span>
          <span className="selectable mt-0.5 block t-label leading-relaxed text-slate-500">
            {t("cloud.autoBackup.hint")}
          </span>
        </span>
      </label>

      {lastResult && (
        <p className="selectable rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 t-label leading-relaxed text-slate-400">
          {lastResult}
        </p>
      )}

      {/* 復元は手元のデータを上書きするので確認を挟む */}
      <ConfirmDialog
        open={confirmRestore}
        title={t("cloud.restore.confirmTitle")}
        message={t("cloud.restore.confirmBody")}
        confirmLabel={t("cloud.restore.confirmLabel")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          setConfirmRestore(false);
          void handleRestore();
        }}
        onCancel={() => setConfirmRestore(false)}
      />
    </div>
  );
}
