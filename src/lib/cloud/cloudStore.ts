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
    toastError("クラウド同期の状態を確認できませんでした", e);
  }
}

/** OAuth クライアント ID を保存する。 */
export async function setClientId(clientId: string): Promise<boolean> {
  try {
    replace(await invoke<CloudStatus>("cloud_set_client_id", { clientId }));
    toastSuccess("クライアント ID を保存しました");
    return true;
  } catch (e) {
    toastError("クライアント ID を保存できませんでした", e);
    return false;
  }
}

/** ブラウザを開いて Google と連携する。 */
export async function connect(): Promise<boolean> {
  try {
    replace(await invoke<CloudStatus>("cloud_connect"));
    toastSuccess("Google Drive と連携しました");
    return true;
  } catch (e) {
    toastError("Google Drive と連携できませんでした", e);
    return false;
  }
}

/** 連携を解除する。クラウド上のバックアップは残る。 */
export async function disconnect(): Promise<void> {
  try {
    replace(await invoke<CloudStatus>("cloud_disconnect"));
    toastSuccess("連携を解除しました");
  } catch (e) {
    toastError("連携を解除できませんでした", e);
  }
}

export async function setAutoBackup(enabled: boolean): Promise<void> {
  try {
    replace(await invoke<CloudStatus>("cloud_set_auto_backup", { enabled }));
  } catch (e) {
    toastError("自動バックアップの設定を保存できませんでした", e);
  }
}

/** 現在のデータをクラウドへ上げる。 */
export async function backup(): Promise<CloudBackupResult | null> {
  try {
    const result = await invoke<CloudBackupResult>("cloud_backup");
    await loadCloudStatus();
    toastSuccess("クラウドへバックアップしました");
    return result;
  } catch (e) {
    toastError("バックアップできませんでした", e);
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
    toastError("復元できませんでした", e);
    return null;
  }
}

export async function listBackups(): Promise<CloudBackupFile[]> {
  try {
    return await invoke<CloudBackupFile[]>("cloud_list_backups");
  } catch (e) {
    toastError("バックアップ一覧を取得できませんでした", e);
    return [];
  }
}
