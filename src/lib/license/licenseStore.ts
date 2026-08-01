import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import type { LicenseStatus } from "@/types";

/**
 * ライセンスの状態。
 * **生のキーはフロントに持たない**（マスク済み文字列だけが返る）。
 */
const UNKNOWN: LicenseStatus = {
  activated: false,
  masked: null,
  message: "ライセンス状態を確認しています…",
};

let status: LicenseStatus = UNKNOWN;
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

export function useLicense(): LicenseStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  );
}

export function getLicense(): LicenseStatus {
  return status;
}

function replace(next: LicenseStatus) {
  status = next;
  emit();
}

export async function loadLicense(): Promise<void> {
  if (!isTauri()) return;
  try {
    replace(await invoke<LicenseStatus>("license_status"));
  } catch (e) {
    toastError("ライセンス状態を確認できませんでした", e);
  }
}

/** キーを検証して保存する。形式が違えば理由が返る。 */
export async function activateLicense(key: string): Promise<boolean> {
  try {
    replace(await invoke<LicenseStatus>("license_activate", { key }));
    toastSuccess("ライセンスを有効化しました");
    return true;
  } catch (e) {
    toastError("ライセンスを有効化できませんでした", e);
    return false;
  }
}

export async function clearLicense(): Promise<void> {
  try {
    replace(await invoke<LicenseStatus>("license_clear"));
  } catch (e) {
    toastError("ライセンスを解除できませんでした", e);
  }
}
