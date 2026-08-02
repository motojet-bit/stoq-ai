import { t } from "@/lib/i18n/i18n";
import type { WorkspaceTab } from "@/types";

/**
 * 起動時のタブ構成。
 *
 * 会話履歴は SQLite（`chats.db`）から読み込むようになったため、
 * ここにあったダミーデータは削除した。
 */
export const INITIAL_TABS: WorkspaceTab[] = [
  { id: "t1", title: t("app.workspace"), kind: "workspace", ticker: null, closable: false },
];
