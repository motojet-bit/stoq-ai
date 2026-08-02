import { errorMessage } from "@/lib/errors/errorMessage";
import { useSyncExternalStore } from "react";

export type ToastKind = "error" | "warning" | "success" | "info";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
}

/** 種類ごとの自動消去までの時間（ミリ秒）。エラーは長めに残す。 */
const LIFETIME: Record<ToastKind, number> = {
  error: 12_000,
  warning: 9_000,
  success: 4_000,
  info: 6_000,
};

let toasts: Toast[] = [];
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

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  );
}

export function pushToast(kind: ToastKind, title: string, detail?: string): string {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, kind, title, detail }];
  emit();
  window.setTimeout(() => dismissToast(id), LIFETIME[kind]);
  return id;
}

export function dismissToast(id: string): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

/** 成功の通知。 */
export function toastSuccess(title: string, detail?: string): void {
  pushToast("success", title, detail);
}

/**
 * エラー用のショートカット。
 *
 * **Rust から来たエラーコードは、ここで表示言語の文面に直す。**
 * 各呼び出し側で `String(e)` していると、コードが生のまま画面に出る。
 */
export function toastError(title: string, cause: unknown): void {
  pushToast("error", title, errorMessage(cause));
}
