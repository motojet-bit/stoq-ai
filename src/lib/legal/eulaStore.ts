import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import { isBlocked } from "@/lib/legal/eula";
import type { EulaStatus } from "@/types";

/**
 * 免責事項への同意状態。
 *
 * 実体は Rust の設定ファイル（`eula_agreed`）にあり、ここはそのキャッシュ。
 * **未確認のうちは `null`** にしておく。読み込み中に「同意済み」と
 * 見なすと、未同意のまま一瞬でも操作できてしまう。
 */
let status: EulaStatus | null = null;
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

export function useEulaStatus(): EulaStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  );
}

export function getEulaStatus(): EulaStatus | null {
  return status;
}

/** 同意が済むまでアプリを使わせないか。 */
export function useEulaBlocked(): boolean {
  return isBlocked(useEulaStatus());
}

function replace(next: EulaStatus) {
  status = next;
  emit();
}

/** 設定の読み込み結果から取り込む。 */
export function syncFromSettings(eula: EulaStatus | undefined | null): void {
  if (!eula) return;
  replace(eula);
}

export async function loadEula(): Promise<void> {
  if (!isTauri()) {
    // ブラウザで開いたときは開発用に素通しする（配布物では必ず Tauri 内で動く）
    replace({ agreed: true, agreedAtMs: 0 });
    return;
  }
  try {
    replace(await invoke<EulaStatus>("eula_status"));
  } catch (e) {
    toastError("免責事項の同意状態を確認できませんでした", e);
  }
}

/** 同意する。 */
export async function agreeEula(): Promise<boolean> {
  try {
    replace(await invoke<EulaStatus>("eula_agree"));
    return true;
  } catch (e) {
    toastError("同意を保存できませんでした", e);
    return false;
  }
}

/**
 * 同意を撤回する。
 *
 * **ライセンスには触れない。** 撤回してもキーは有効なまま残り、
 * 再び同意すればそのまま使える。撤回した瞬間からアプリは操作できなくなる。
 */
export async function revokeEula(): Promise<boolean> {
  try {
    replace(await invoke<EulaStatus>("eula_revoke"));
    return true;
  } catch (e) {
    toastError("同意を撤回できませんでした", e);
    return false;
  }
}
