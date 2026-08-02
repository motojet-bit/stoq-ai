import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import { describeRestore, DRIVE_APPDATA_SCOPE } from "@/lib/cloud/cloudBackup";
import type {
  CloudBackupFile,
  CloudBackupResult,
  CloudRestoreResult,
  CloudStatus,
} from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * クラウド同期の状態。
 *
 * **トークンはフロントに一切持たない**（Rust 側が保持し、
 * ここへ返るのは「連携済みか」とマスク済みのクライアント ID だけ）。
 */
const UNKNOWN: CloudStatus = {
  connected: false,
  clientIdConfigured: false,
  clientIdMasked: null,
  autoBackup: false,
  lastBackupMs: 0,
  scope: DRIVE_APPDATA_SCOPE,
};

let status: CloudStatus = UNKNOWN;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  );
}

export function getCloudStatus(): CloudStatus {
  return status;
}

function replace(next: CloudStatus) {
  status = next;
  emit();
}

/** 設定読み込みの結果からクラウドの状態も取り込む。 */
export function syncFromSettings(cloud: CloudStatus | undefined | null): void {
  if (!cloud) return;
  replace(cloud);
}

export async function loadCloudStatus(): Promise<void> {
  if (!isTauri()) return;
  try {
    replace(await invoke<CloudStatus>("cloud_status"));
  } catch (e) {
    toastError(t("toast.cloud.statusFailed"), e);
  }
}

/** OAuth クライアント ID を保存する。 */
export async function setClientId(clientId: string): Promise<boolean> {
  try {
    replace(await invoke<CloudStatus>("cloud_set_client_id", { clientId }));
    toastSuccess(t("toast.cloud.clientIdSaved"));
    return true;
  } catch (e) {
    toastError(t("toast.cloud.clientIdFailed"), e);
    return false;
  }
}

/** ブラウザを開いて Google と連携する。 */
export async function connect(): Promise<boolean> {
  try {
    replace(await invoke<CloudStatus>("cloud_connect"));
    toastSuccess(t("toast.cloud.connected"));
    return true;
  } catch (e) {
    toastError(t("toast.cloud.connectFailed"), e);
    return false;
  }
}

/** 連携を解除する。クラウド上のバックアップは残る。 */
export async function disconnect(): Promise<void> {
  try {
    replace(await invoke<CloudStatus>("cloud_disconnect"));
    toastSuccess(t("toast.cloud.disconnected"));
  } catch (e) {
    toastError(t("toast.cloud.disconnectFailed"), e);
  }
}

export async function setAutoBackup(enabled: boolean): Promise<void> {
  try {
    replace(await invoke<CloudStatus>("cloud_set_auto_backup", { enabled }));
  } catch (e) {
    toastError(t("toast.cloud.autoBackupFailed"), e);
  }
}

/** 現在のデータをクラウドへ上げる。 */
export async function backup(): Promise<CloudBackupResult | null> {
  try {
    const result = await invoke<CloudBackupResult>("cloud_backup");
    await loadCloudStatus();
    toastSuccess(t("toast.cloud.backedUp"));
    return result;
  } catch (e) {
    toastError(t("toast.cloud.backupFailed"), e);
    return null;
  }
}

/**
 * クラウドから復元する。`fileId` を省略すると最新を使う。
 *
 * データベースのファイルごと差し替わるため、**画面に開いたままの内容は古いまま**。
 * 呼び出し側で再起動を促すこと。
 */
export async function restore(fileId?: string): Promise<CloudRestoreResult | null> {
  try {
    const result = await invoke<CloudRestoreResult>("cloud_restore", {
      fileId: fileId ?? null,
    });
    toastSuccess(describeRestore(result.restored));
    return result;
  } catch (e) {
    toastError(t("toast.cloud.restoreFailed"), e);
    return null;
  }
}

export async function listBackups(): Promise<CloudBackupFile[]> {
  try {
    return await invoke<CloudBackupFile[]>("cloud_list_backups");
  } catch (e) {
    toastError(t("toast.cloud.listFailed"), e);
    return [];
  }
}
