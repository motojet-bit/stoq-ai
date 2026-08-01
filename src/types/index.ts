/** アプリ全体で共有する型定義 */

/** ID が固定の組み込みプロバイダ */
export type BuiltinProviderId = "openai" | "anthropic" | "gemini";

/**
 * プロバイダ ID。組み込みの 3 種、またはユーザーが追加した
 * OpenAI互換プロバイダの採番済み ID（例: `custom-1738…`）。
 */
export type ProviderId = string;

/** ユーザーが追加した OpenAI互換プロバイダ 1 件 */
export interface CustomProvider {
  id: ProviderId;
  /** 画面に出す識別ラベル（例: DeepSeek, Moonshot） */
  label: string;
  baseUrl: string;
  model: string;
}

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
  /** 組み込みプロバイダのモデル名 */
  models: Record<string, string>;
  customProviders: CustomProvider[];
  secUserAgent: string;
  maxPromptTokens: number;
  /** 組み込み + カスタムの全プロバイダのキー状態 */
  keys: KeyStatus[];
}

/** settings_save に渡す差分。指定した項目だけ更新される。 */
export interface SettingsPatch {
  provider?: ProviderId;
  models?: Record<string, string>;
  secUserAgent?: string;
  maxPromptTokens?: number;
}

/** settings_update_custom_provider に渡す差分 */
export interface CustomProviderPatch {
  label?: string;
  baseUrl?: string;
  model?: string;
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
