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

/**
 * 引用行の目印。
 *
 * **行頭に付ける。** 画面では赤字にして、自分が書いた文と
 * 貼り込んだ引用を見分けられるようにする。
 * Markdown の引用記法と同じ記号にしてあるので、そのまま貼っても意味が通る。
 */
export const QUOTE_MARK = "> ";

/** 本文の各行に引用の目印を付ける。 */
export function markAsQuote(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? QUOTE_MARK.trimEnd() : QUOTE_MARK + line))
    .join("\n");
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
