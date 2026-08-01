import { useState } from "react";
import type { ChatSession } from "@/types";
import ChatHistoryItem from "@/components/ChatHistoryItem";
import ConfirmDialog from "@/components/ConfirmDialog";
import { IconPanelLeft, IconPlus } from "@/components/Icons";

interface Props {
  collapsed: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onToggleCollapse: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
}

/** Chatbox 風の会話履歴サイドバー（折りたたみ可能） */
export default function Sidebar({
  collapsed,
  sessions,
  activeSessionId,
  onToggleCollapse,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onNewChat,
}: Props) {
  const [deleting, setDeleting] = useState<ChatSession | null>(null);

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-900 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="サイドバーを開く (Ctrl+B)"
          className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <IconPanelLeft className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          onClick={onNewChat}
          title="新規チャット"
          className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-emerald-400"
        >
          <IconPlus className="h-4.5 w-4.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 px-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-8 flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-2.5 text-[13px] text-slate-200 transition-colors hover:border-emerald-700 hover:bg-slate-700 hover:text-emerald-300"
        >
          <IconPlus className="h-4 w-4" />
          <span>新規チャット</span>
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="サイドバーを閉じる (Ctrl+B)"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <IconPanelLeft className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          履歴
        </span>
        {sessions.length > 0 && (
          <span className="font-mono text-[11px] text-slate-600">{sessions.length}</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-slate-600">
            まだ会話がありません。
            <br />
            対話ウィンドウで質問すると、
            <br />
            自動でここに保存されます。
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((session) => (
              <ChatHistoryItem
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                onSelect={() => onSelectSession(session.id)}
                onRename={(title) => onRenameSession(session.id, title)}
                onDelete={() => setDeleting(session)}
              />
            ))}
          </ul>
        )}
      </nav>

      <div className="shrink-0 border-t border-slate-800 px-3 py-2 text-[11px] text-slate-600">
        会話は自動保存されます
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="このチャットを削除しますか？"
        message={
          `「${deleting?.title ?? ""}」と、その中の ${deleting?.messageCount ?? 0} 件のメッセージが削除されます。\n` +
          "この操作は取り消せません。"
        }
        confirmLabel="削除する"
        cancelLabel="もどる"
        destructive
        onConfirm={() => {
          if (deleting) onDeleteSession(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </aside>
  );
}
