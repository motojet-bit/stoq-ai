/** アプリ全体で共有する型定義 */

/** LLM プロバイダ */
export type LlmProvider = "openai" | "claude" | "gemini";

/** APIキーの設定状況（キー本体は保持せず、マスク済み文字列のみ持つ） */
export interface ApiKeyStatus {
  provider: LlmProvider;
  label: string;
  configured: boolean;
  /** 例: "sk-…3f9a"。未設定なら null */
  masked: string | null;
}

/** 左サイドバーに並ぶ会話履歴の 1 件 */
export interface ChatSession {
  id: string;
  title: string;
  /** 関連づけられたティッカー（あれば） */
  ticker: string | null;
  /** 表示用の相対時刻ラベル。Phase 2 で実時刻に置き換える */
  updatedLabel: string;
}

/** メインエリアのタブ */
export type TabKind = "workspace" | "analysis" | "document";

export interface WorkspaceTab {
  id: string;
  title: string;
  kind: TabKind;
  ticker: string | null;
  /** false のタブは閉じられない（既定のワークスペースなど） */
  closable: boolean;
}

/** ドロップされた一次資料（PDF 等） */
export interface DroppedDocument {
  id: string;
  name: string;
  /** バイト数。取得できない場合は null */
  size: number | null;
}
