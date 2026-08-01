import type { ChatSession, WorkspaceTab } from "@/types";

/**
 * Phase 1 の画面確認用のダミーデータ。
 * Phase 2 で永続化ストア（SQLite 等）からの読み込みに置き換える。
 */
export const SAMPLE_SESSIONS: ChatSession[] = [
  { id: "s1", title: "NVDA FY26 Q1 決算レビュー", ticker: "NVDA", updatedLabel: "たった今" },
  { id: "s2", title: "半導体セクターの比較", ticker: null, updatedLabel: "2 時間前" },
  { id: "s3", title: "MSFT 10-K リスク要因の抽出", ticker: "MSFT", updatedLabel: "昨日" },
  { id: "s4", title: "ASML 受注残の推移", ticker: "ASML", updatedLabel: "3 日前" },
  { id: "s5", title: "配当貴族スクリーニング条件", ticker: null, updatedLabel: "先週" },
];

export const INITIAL_TABS: WorkspaceTab[] = [
  { id: "t1", title: "ワークスペース", kind: "workspace", ticker: null, closable: false },
];
