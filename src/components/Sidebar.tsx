import type { ChatSession } from "@/types";
import { IconPanelLeft, IconPlus, IconMessage } from "@/components/Icons";

interface Props {
  collapsed: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onToggleCollapse: () => void;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}

/** Chatbox 風の会話履歴サイドバー（折りたたみ可能） */
export default function Sidebar({
  collapsed,
  sessions,
  activeSessionId,
  onToggleCollapse,
  onSelectSession,
  onNewChat,
}: Props) {
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
          title="新規チャット (Ctrl+N)"
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

      <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        履歴
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-slate-600">
            まだ会話がありません。
            <br />
            「新規チャット」から始めてください。
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    className={`group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                      active
                        ? "bg-slate-800 text-slate-100"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    <IconMessage
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        active ? "text-emerald-400" : "text-slate-600 group-hover:text-slate-500"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] leading-snug">{s.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {s.ticker && (
                          <span className="rounded bg-slate-700/70 px-1 font-mono text-[10px] text-slate-300">
                            {s.ticker}
                          </span>
                        )}
                        {s.updatedLabel}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="shrink-0 border-t border-slate-800 px-3 py-2 text-[11px] text-slate-600">
        Phase 1 — スケルトンUI
      </div>
    </aside>
  );
}
