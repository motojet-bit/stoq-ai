import type { WorkspaceTab } from "@/types";

/**
 * 起動時のタブ構成。
 *
 * 会話履歴は SQLite（`chats.db`）から読み込むようになったため、
 * ここにあったダミーデータは削除した。
 */
export const INITIAL_TABS: WorkspaceTab[] = [
  { id: "t1", title: "ワークスペース", kind: "workspace", ticker: null, closable: false },
];
