import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import type { AppSettings, ProviderId, SettingsPatch } from "@/types";

/**
 * 設定のグローバルストア。
 *
 * 実体は Rust 側（OS のアプリ設定ディレクトリ）にあり、ここはそのキャッシュ。
 * **生の APIキーはこのストアに一切入らない**（Rust から返るのはマスク済み文字列のみ）。
 */
let snapshot: AppSettings | null = null;
let loadError: string | null = null;

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

export function useSettings(): AppSettings | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

export function useSettingsError(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => loadError,
    () => loadError,
  );
}

export async function loadSettings(): Promise<AppSettings | null> {
  if (!isTauri()) {
    loadError =
      "ブラウザで実行中のため設定を読み込めません。`npm run tauri:dev` で起動してください。";
    emit();
    return null;
  }
  try {
    snapshot = await invoke<AppSettings>("settings_load");
    loadError = null;
  } catch (e) {
    loadError = String(e);
  }
  emit();
  return snapshot;
}

export async function saveSettings(patch: SettingsPatch): Promise<AppSettings> {
  snapshot = await invoke<AppSettings>("settings_save", { patch });
  emit();
  return snapshot;
}

/** APIキーを保存する。空文字を渡すと削除。 */
export async function setApiKey(provider: ProviderId, apiKey: string): Promise<AppSettings> {
  snapshot = await invoke<AppSettings>("settings_set_key", { provider, apiKey });
  emit();
  return snapshot;
}

/** 現在選択中のプロバイダにキーが設定されているか。 */
export function isActiveProviderReady(settings: AppSettings | null): boolean {
  if (!settings) return false;
  return settings.keys.some((k) => k.provider === settings.provider && k.configured);
}
