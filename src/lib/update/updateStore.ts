import { useSyncExternalStore } from "react";
import { isTauri } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import { t } from "@/lib/i18n/i18n";
import { APP_VERSION } from "@/lib/ui/appMeta";
import { formatProgress, isNewer, trimNotes } from "@/lib/update/updateVersion";

/**
 * アプリの更新。
 *
 * **確認・ダウンロード・適用は公式プラグイン（`@tauri-apps/plugin-updater`）に任せる。**
 * 署名の検証もプラグイン側で行われるので、`tauri.conf.json` の公開鍵と
 * 一致しない配布物は適用されない。ここが持つのは画面に出す状態だけ。
 */

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "upToDate"
  | "error";

export interface UpdateState {
  phase: UpdatePhase;
  /** 見つかった新しい版（`0.2.0` など） */
  version: string | null;
  notes: string;
  /** ダウンロード中の進捗表示 */
  progress: string;
  /** 失敗したときの理由 */
  error: string;
  /** 手動で確認したか（自動チェックでは「最新です」を出さない） */
  manual: boolean;
}

const INITIAL: UpdateState = {
  phase: "idle",
  version: null,
  notes: "",
  progress: "",
  error: "",
  manual: false,
};

let state: UpdateState = INITIAL;
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

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function getUpdateState(): UpdateState {
  return state;
}

function patch(next: Partial<UpdateState>) {
  state = { ...state, ...next };
  emit();
}

/** ダイアログを閉じる（更新は次回起動時にまた案内する）。 */
export function dismissUpdate(): void {
  state = INITIAL;
  emit();
}

/**
 * 見つかった更新を保持しておく。
 * プラグインの `Update` は型を持ち込まずに扱う（依存を薄くするため）。
 */
interface PluginUpdate {
  version: string;
  body?: string | null;
  downloadAndInstall: (
    onEvent: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
  ) => Promise<void>;
}

let pending: PluginUpdate | null = null;

/** テスト用の差し替え口。 */
let checkImpl: (() => Promise<PluginUpdate | null>) | null = null;
let relaunchImpl: (() => Promise<void>) | null = null;

export function __setUpdateImpl(
  check: (() => Promise<PluginUpdate | null>) | null,
  relaunch: (() => Promise<void>) | null,
): void {
  checkImpl = check;
  relaunchImpl = relaunch;
}

async function runCheck(): Promise<PluginUpdate | null> {
  if (checkImpl) return checkImpl();
  const { check } = await import("@tauri-apps/plugin-updater");
  return (await check()) as unknown as PluginUpdate | null;
}

async function runRelaunch(): Promise<void> {
  if (relaunchImpl) return relaunchImpl();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/**
 * 更新の有無を確かめる。
 *
 * @param manual 設定画面のボタンから呼んだか。
 *   **自動チェックでは「最新です」を出さない。** 起動のたびにトーストが出ると邪魔になる。
 */
export async function checkForUpdate(manual = false): Promise<void> {
  if (!isTauri()) {
    if (manual) toastError(t("update.checkFailed"), t("update.appOnly"));
    return;
  }
  if (state.phase === "checking" || state.phase === "downloading") return;

  patch({ phase: "checking", manual, error: "" });

  try {
    const update = await runCheck();

    // プラグインの判定に加えて版も見る（配信側の設定ミスで巻き戻らないように）
    if (!update || !isNewer(update.version, APP_VERSION)) {
      pending = null;
      patch({ phase: manual ? "upToDate" : "idle", version: null });
      if (manual) toastSuccess(t("update.upToDate", { version: APP_VERSION }));
      return;
    }

    pending = update;
    patch({
      phase: "available",
      version: update.version,
      notes: trimNotes(update.body),
    });
  } catch (e) {
    pending = null;
    const reason = e instanceof Error ? e.message : String(e);
    patch({ phase: manual ? "error" : "idle", error: reason });
    if (manual) toastError(t("update.checkFailed"), reason);
  }
}

/** ダウンロードして適用する。終わったら再起動を促す。 */
export async function downloadAndInstall(): Promise<void> {
  if (!pending || state.phase === "downloading") return;

  patch({ phase: "downloading", progress: "", error: "" });

  let downloaded = 0;
  let total: number | null = null;

  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data?.contentLength ?? null;
        downloaded = 0;
      } else if (event.event === "Progress") {
        downloaded += event.data?.chunkLength ?? 0;
      }
      patch({ progress: formatProgress(downloaded, total) });
    });
    patch({ phase: "ready", progress: "" });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    patch({ phase: "error", error: reason });
    toastError(t("update.installFailed"), reason);
  }
}

/** 適用済みの更新を反映するため、アプリを再起動する。 */
export async function restartApp(): Promise<void> {
  try {
    await runRelaunch();
  } catch (e) {
    toastError(t("update.restartFailed"), e instanceof Error ? e.message : String(e));
  }
}

/** テスト用。 */
export function resetUpdateState(): void {
  pending = null;
  state = INITIAL;
  emit();
}
