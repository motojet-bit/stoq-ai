import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChatSession } from "@/types";
import { IconClose, IconMessage, IconPencil } from "@/components/Icons";

interface Props {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

/** 経過時間を「たった今 / 3 時間前 / 昨日」のように表す。 */
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes} 分前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時間前`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "昨日";
  if (days < 7) return `${days} 日前`;
  return new Date(ms).toLocaleDateString("ja-JP");
}

/** サイドバーのチャット履歴 1 件。ダブルクリックまたは ✏️ でリネームできる。 */
export default function ChatHistoryItem({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    setDraft(session.title);
  }, [session.title]);

  const commit = () => {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== session.title) onRename(title);
    else setDraft(session.title);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(session.title);
      setEditing(false);
    }
  };

  return (
    <li>
      <div
        className={`group flex w-full items-start gap-2 rounded-md px-2 py-2 transition-colors ${
          active ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800/60"
        }`}
      >
        <IconMessage
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            active ? "text-emerald-400" : "text-slate-600 group-hover:text-slate-500"
          }`}
        />

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              aria-label="チャットのタイトル"
              className="selectable h-6 w-full rounded border border-emerald-700 bg-slate-950 px-1 text-[13px] text-slate-100 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={onSelect}
              onDoubleClick={() => setEditing(true)}
              title={`${session.title}\nダブルクリックで名前を変更`}
              className="block w-full truncate text-left text-[13px] leading-snug"
            >
              {session.title}
            </button>
          )}

          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            {session.ticker && (
              <span className="rounded bg-slate-700/70 px-1 font-mono text-[10px] text-slate-300">
                {session.ticker}
              </span>
            )}
            <span>{relativeTime(session.updatedAtMs)}</span>
            <span className="text-slate-600">·</span>
            <span>{session.messageCount} 件</span>
          </div>
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`${session.title} の名前を変更`}
              title="名前を変更"
              className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-emerald-300"
            >
              <IconPencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`${session.title} を削除`}
              title="このチャットを削除"
              className="rounded p-1 text-slate-500 hover:bg-red-950/60 hover:text-red-300"
            >
              <IconClose className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
