/** アプリ全体で共有する型定義 */

/** LLM プロバイダ */
export type ProviderId = "openai" | "anthropic" | "gemini" | "custom";

/** APIキーの設定状況（キー本体は保持せず、マスク済み文字列のみ持つ） */
export interface KeyStatus {
  provider: ProviderId;
  configured: boolean;
  /** 例: "sk-…3f9a"。未設定なら null */
  masked: string | null;
}

/** Rust 側から返る設定の安全な表現。生の APIキーは含まれない。 */
export interface AppSettings {
  provider: ProviderId;
  models: Record<string, string>;
  customBaseUrl: string;
  secUserAgent: string;
  maxPromptTokens: number;
  keys: KeyStatus[];
}

/** settings_save に渡す差分。指定した項目だけ更新される。 */
export interface SettingsPatch {
  provider?: ProviderId;
  models?: Record<string, string>;
  customBaseUrl?: string;
  secUserAgent?: string;
  maxPromptTokens?: number;
}

/** LLM に渡す会話 1 メッセージ */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** 画面に表示する会話 1 件（エラーやストリーミング中の状態を持つ） */
export interface DisplayMessage extends ChatMessage {
  id: string;
  streaming?: boolean;
  error?: string;
}

/** Rust 側からストリーミングで届くイベント */
export type LlmEvent =
  | { type: "start"; provider: string; model: string }
  | { type: "delta"; text: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

/** 左サイドバーに並ぶ会話履歴の 1 件 */
export interface ChatSession {
  id: string;
  title: string;
  ticker: string | null;
  updatedLabel: string;
}

/** メインエリアのタブ */
export type TabKind = "workspace" | "analysis" | "document";

export interface WorkspaceTab {
  id: string;
  title: string;
  kind: TabKind;
  ticker: string | null;
  closable: boolean;
}

/** ドロップされた一次資料（PDF 等） */
export interface DroppedDocument {
  id: string;
  name: string;
  size: number | null;
}
