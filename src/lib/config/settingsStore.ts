import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { providerReadiness } from "@/lib/config/providers";
import type {
  AppSettings,
  CustomProviderPatch,
  ProviderId,
  SettingsPatch,
} from "@/types";

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

/** Rust から返った最新の設定でストアを差し替える。 */
function commit(next: AppSettings): AppSettings {
  snapshot = next;
  emit();
  return next;
}

export async function saveSettings(patch: SettingsPatch): Promise<AppSettings> {
  return commit(await invoke<AppSettings>("settings_save", { patch }));
}

/** APIキーを保存する。空文字を渡すと削除。組み込み・カスタムどちらの ID でも可。 */
export async function setApiKey(provider: ProviderId, apiKey: string): Promise<AppSettings> {
  return commit(await invoke<AppSettings>("settings_set_key", { provider, apiKey }));
}

// ------------------------------------------------ OpenAI互換プロバイダの追加・更新・削除

export async function addCustomProvider(label?: string): Promise<AppSettings> {
  return commit(await invoke<AppSettings>("settings_add_custom_provider", { label }));
}

export async function updateCustomProvider(
  id: ProviderId,
  patch: CustomProviderPatch,
): Promise<AppSettings> {
  return commit(
    await invoke<AppSettings>("settings_update_custom_provider", { id, patch }),
  );
}

export async function removeCustomProvider(id: ProviderId): Promise<AppSettings> {
  return commit(await invoke<AppSettings>("settings_remove_custom_provider", { id }));
}

// ------------------------------------------------ 導出

/** 現在選択中のプロバイダで送信できる状態か。 */
export function isActiveProviderReady(settings: AppSettings | null): boolean {
  if (!settings) return false;
  return providerReadiness(settings, settings.provider).ready;
}
