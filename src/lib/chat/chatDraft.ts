import { useSyncExternalStore } from "react";

/**
 * 対話パネルの入力欄へ外から文章を流し込むための受け渡し口。
 *
 * 過去の分析ログを「対話へ引用」するために使う。
 * 同じ文章を続けて引用できるよう、値ではなく **連番の変化**で反映する。
 */
export interface ChatDraft {
  text: string;
  seq: number;
}

let draft: ChatDraft | null = null;
let seq = 0;

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

export function useChatDraft(): ChatDraft | null {
  return useSyncExternalStore(
    subscribe,
    () => draft,
    () => draft,
  );
}

export function getChatDraft(): ChatDraft | null {
  return draft;
}

/** 入力欄に流し込む。空文字は無視する。 */
export function pushChatDraft(text: string): void {
  const trimmed = text.trim();
  if (trimmed === "") return;
  seq += 1;
  draft = { text: trimmed, seq };
  emit();
}

/** テスト用。 */
export function resetChatDraft(): void {
  draft = null;
  seq = 0;
  emit();
}
