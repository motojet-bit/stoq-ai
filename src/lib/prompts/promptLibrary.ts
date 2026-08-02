import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import type { StoredPrompt } from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * AI の役割設定（システムプロンプト）ライブラリのストア。
 * 実体は Rust 側の SQLite（`library.db` の `prompts`）。
 *
 * どれを使っているかは端末ごとの好みなので localStorage に置く
 * （DB に入れると設定同期の対象になってしまう）。
 */

/**
 * ライブラリを使わないときの既定の役割。
 *
 * **出力言語の指定は書かない。** Rust 側が表示言語に応じて
 * `language_directive` を足すので、ここで「日本語で」と書くと食い違う。
 */
export function defaultSystemPrompt(): string {
  return t("prompt.defaultRole");
}

const ACTIVE_KEY = "stockanalyzer.activePromptId";

let prompts: StoredPrompt[] = [];
let activeId: string | null = readActiveId();

const listeners = new Set<() => void>();

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePrompts(): StoredPrompt[] {
  return useSyncExternalStore(
    subscribe,
    () => prompts,
    () => prompts,
  );
}

export function useActivePromptId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => activeId,
    () => activeId,
  );
}

export function getPrompts(): StoredPrompt[] {
  return prompts;
}

/** いま選んでいる役割。未選択、または消された役割を指していれば null。 */
export function getActivePrompt(): StoredPrompt | null {
  return prompts.find((p) => p.id === activeId) ?? null;
}

/** LLM に渡すシステムプロンプト。役割が未選択なら既定文を使う。 */
export function activeSystemPrompt(): string {
  return getActivePrompt()?.body ?? defaultSystemPrompt();
}

export function setActivePrompt(id: string | null): void {
  activeId = id;
  try {
    if (id === null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // 保存できなくても動作は続ける
  }
  emit();
}

function replace(next: StoredPrompt[]) {
  prompts = next;
  // 選択中の役割が消えていたら既定へ戻す
  if (activeId !== null && !next.some((p) => p.id === activeId)) {
    setActivePrompt(null);
    return;
  }
  emit();
}

export async function loadPrompts(): Promise<void> {
  if (!isTauri()) return;
  try {
    replace(await invoke<StoredPrompt[]>("prompts_list"));
  } catch (e) {
    toastError(t("toast.promptLib.loadFailed"), e);
  }
}

/** `id` を渡すと更新、渡さなければ新規作成。 */
export async function savePrompt(
  id: string | null,
  title: string,
  body: string,
): Promise<void> {
  try {
    replace(await invoke<StoredPrompt[]>("prompts_save", { id, title, body }));
  } catch (e) {
    toastError(t("toast.promptLib.saveFailed"), e);
    throw e;
  }
}

export async function removePrompt(id: string): Promise<void> {
  try {
    replace(await invoke<StoredPrompt[]>("prompts_remove", { id }));
  } catch (e) {
    toastError(t("toast.promptLib.deleteFailed"), e);
  }
}
