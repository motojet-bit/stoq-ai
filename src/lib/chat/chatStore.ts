import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import { clearChatAttachments } from "@/lib/chat/chatAttachments";
import type { ChatSession, DisplayMessage, StoredChatMessage } from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * チャット履歴のストア。実体は Rust 側の SQLite（`chats.db`）。
 *
 * セッションの一覧・切り替え・リネーム・削除と、
 * 現在開いているセッションのメッセージを保持する。
 */
let sessions: ChatSession[] = [];
let activeId: string | null = null;
let messages: DisplayMessage[] = [];
let loadingMessages = false;

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

export function useChatSessions(): ChatSession[] {
  return useSyncExternalStore(
    subscribe,
    () => sessions,
    () => sessions,
  );
}

export function useActiveSessionId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => activeId,
    () => activeId,
  );
}

export function useChatMessages(): DisplayMessage[] {
  return useSyncExternalStore(
    subscribe,
    () => messages,
    () => messages,
  );
}

export function useChatLoading(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loadingMessages,
    () => loadingMessages,
  );
}

// ---------------------------------------------------------------- セッション

/** 起動時に履歴を読み込み、最新のセッションを開く。 */
export async function loadChatSessions(): Promise<void> {
  if (!isTauri()) return;
  try {
    sessions = await invoke<ChatSession[]>("chat_list_sessions");
    emit();

    if (!activeId && sessions.length > 0) {
      await selectSession(sessions[0].id);
    }
  } catch (e) {
    toastError(t("toast.chat.loadFailed"), e);
  }
}

export async function selectSession(id: string): Promise<void> {
  // 会話を切り替えたら、前の会話に付けた使い捨て資料は捨てる
  clearChatAttachments();
  if (!isTauri()) return;

  activeId = id;
  messages = [];
  loadingMessages = true;
  emit();

  try {
    const stored = await invoke<StoredChatMessage[]>("chat_load_messages", {
      sessionId: id,
    });
    messages = stored.map((m) => ({ id: m.id, role: m.role, content: m.content }));
  } catch (e) {
    toastError(t("toast.chat.openFailed"), e);
  } finally {
    loadingMessages = false;
    emit();
  }
}

/** 新しいチャットを作って開く。 */
export async function createSession(ticker?: string | null): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const session = await invoke<ChatSession>("chat_create_session", {
      title: null,
      ticker: ticker ?? null,
    });
    sessions = [session, ...sessions];
    activeId = session.id;
    messages = [];
    emit();
    return session.id;
  } catch (e) {
    toastError(t("toast.chat.createFailed"), e);
    return null;
  }
}

export async function renameSession(id: string, title: string): Promise<void> {
  if (!isTauri()) return;
  try {
    sessions = await invoke<ChatSession[]>("chat_rename_session", { id, title });
    emit();
  } catch (e) {
    toastError(t("toast.chat.renameFailed"), e);
  }
}

/**
 * アーカイブへ移動 / アーカイブから復元する。
 * 削除ではないので、開いている会話も本文はそのまま残す。
 */
export async function archiveSession(id: string, archived: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    sessions = await invoke<ChatSession[]>("chat_set_archived", { id, archived });
    emit();
  } catch (e) {
    toastError(t("toast.chat.archiveFailed"), e);
  }
}

export async function deleteSession(id: string): Promise<void> {
  if (!isTauri()) return;
  try {
    sessions = await invoke<ChatSession[]>("chat_delete_session", { id });

    // 開いていたチャットを消した場合は、次に新しいものへ移る
    if (activeId === id) {
      activeId = null;
      messages = [];
      emit();
      if (sessions.length > 0) await selectSession(sessions[0].id);
    }
    emit();
  } catch (e) {
    toastError(t("toast.chat.deleteFailed"), e);
  }
}

/**
 * いま開いている会話のログだけを消す。
 *
 * **タブや分析結果には触れない。** 消したいのは会話の中身であって、
 * 銘柄タブや分析結果まで巻き添えにすると、やり直しが大きくなりすぎる。
 *
 * セッションごと消してから、空の状態へ戻す（同じ ID に空のログを残さない）。
 */
export async function clearActiveConversation(): Promise<boolean> {
  const id = activeId;
  // まだ 1 件も送っていなければ、画面を空にするだけでよい
  if (!id) {
    messages = [];
    emit();
    return true;
  }
  if (!isTauri()) {
    messages = [];
    emit();
    return true;
  }

  try {
    sessions = await invoke<ChatSession[]>("chat_delete_session", { id });
    activeId = null;
    messages = [];
    emit();
    return true;
  } catch (e) {
    toastError(t("toast.chat.deleteFailed"), e);
    return false;
  }
}

// ---------------------------------------------------------------- メッセージ

/** 画面上のメッセージ配列を差し替える（ストリーミング中の更新用）。 */
export function setMessages(next: DisplayMessage[]): void {
  messages = next;
  emit();
}

export function patchMessage(id: string, patch: Partial<DisplayMessage>): void {
  messages = messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
  emit();
}

/**
 * メッセージを DB に追記する。セッションが無ければ作る。
 * 返り値は追記先のセッション ID。
 */
export async function persistMessage(
  role: "user" | "assistant",
  content: string,
  ticker?: string | null,
): Promise<string | null> {
  if (!isTauri() || content.trim().length === 0) return activeId;

  let sessionId = activeId;
  if (!sessionId) sessionId = await createSession(ticker);
  if (!sessionId) return null;

  try {
    await invoke("chat_append_message", { sessionId, role, content });
    // タイトルの自動命名と更新時刻を反映するため一覧を取り直す
    sessions = await invoke<ChatSession[]>("chat_list_sessions");
    emit();
  } catch (e) {
    toastError(t("toast.chat.messageFailed"), e);
  }
  return sessionId;
}

export function activeSessionId(): string | null {
  return activeId;
}
