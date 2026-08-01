import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AppSettings, DisplayMessage } from "@/types";
import { streamChat } from "@/lib/llm/client";
import { providerLabel, providerReadiness } from "@/lib/config/providers";
import {
  patchMessage,
  persistMessage,
  setMessages,
  useChatLoading,
  useChatMessages,
} from "@/lib/chat/chatStore";
import { SCALE_CLASSES, useTextScale } from "@/lib/ui/textScale";
import { IconMessage } from "@/components/Icons";
import PanelHeader from "@/components/PanelHeader";

interface Props {
  settings: AppSettings | null;
  /** 現在開いている銘柄。新規チャットに紐づける */
  ticker: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

const SYSTEM_PROMPT =
  "あなたは米国株・グローバル株のファンダメンタル分析を支援するアシスタントです。" +
  "根拠を明示し、断定できない点は不確実であると述べてください。回答は日本語で行ってください。";

const newId = () => crypto.randomUUID();

/** 下段の対話パネル。会話は SQLite に保存され、サイドバーから復元できる。 */
export default function ChatPanel({
  settings,
  ticker,
  collapsed,
  onToggleCollapse,
  onOpenSettings,
}: Props) {
  const messages = useChatMessages();
  const loadingHistory = useChatLoading();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scale = useTextScale();
  const t = SCALE_CLASSES[scale];

  const { ready, reason } = settings
    ? providerReadiness(settings, settings.provider)
    : { ready: false, reason: null };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: DisplayMessage = { id: newId(), role: "user", content: text };
    const replyId = newId();
    const history = [...messages, userMessage];

    setMessages([...history, { id: replyId, role: "assistant", content: "", streaming: true }]);
    setInput("");
    setSending(true);

    // ユーザー発言を先に保存する（応答が失敗しても質問は残る）
    await persistMessage("user", text, ticker);

    try {
      const { text: reply } = await streamChat(
        {
          system: SYSTEM_PROMPT,
          // エラー表示用のメッセージは送らない
          messages: history
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        {
          onStart: (_provider, model) => setActiveModel(model),
          onDelta: (delta) =>
            patchMessage(replyId, {
              content:
                (messagesRef.current.find((m) => m.id === replyId)?.content ?? "") + delta,
            }),
        },
      );
      patchMessage(replyId, { streaming: false, content: reply });
      await persistMessage("assistant", reply, ticker);
    } catch (e) {
      patchMessage(replyId, {
        streaming: false,
        error: String(e instanceof Error ? e.message : e),
      });
    } finally {
      setSending(false);
    }
  };

  // onDelta の中で最新の messages を参照するための保持
  const messagesRef = useRef<DisplayMessage[]>(messages);
  messagesRef.current = messages;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter で送信、Shift+Enter で改行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className="flex h-full min-w-0 flex-col bg-slate-950">
      <PanelHeader
        icon={<IconMessage className="h-3.5 w-3.5" />}
        title="対話"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        actions={
          settings && (
            <span className="truncate font-mono text-[11.5px] text-slate-600">
              {providerLabel(settings, settings.provider)}
              {activeModel ? ` / ${activeModel}` : ""}
            </span>
          )
        }
      />

      {!collapsed && (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loadingHistory ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-3 animate-pulse rounded bg-slate-800"
                    style={{ width: `${50 + i * 15}%` }}
                  />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className={`space-y-2 ${t.body} ${t.leading} text-slate-500`}>
                <p>
                  銘柄や決算資料について質問すると、ここに会話が表示されます。
                  会話は自動で保存され、左のサイドバーから開き直せます。
                </p>
                {!ready && (
                  <p className="text-amber-500/90">
                    APIキーが未設定です。
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="ml-1 underline underline-offset-2 hover:text-amber-400"
                    >
                      設定を開く
                    </button>
                  </p>
                )}
              </div>
            ) : (
              <ul className="space-y-4">
                {messages.map((m) => (
                  <li key={m.id} className={`${t.body} ${t.leading}`}>
                    <div
                      className={`mb-1 ${t.label} font-medium ${
                        m.role === "user" ? "text-slate-400" : "text-emerald-400"
                      }`}
                    >
                      {m.role === "user" ? "あなた" : "AI"}
                    </div>
                    {m.error ? (
                      <p className="selectable rounded border border-red-900 bg-red-950/40 px-2.5 py-2 text-red-300">
                        {m.error}
                      </p>
                    ) : (
                      <p className="selectable whitespace-pre-wrap text-slate-300">
                        {m.content}
                        {m.streaming && (
                          <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-emerald-500 align-middle" />
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-800 p-2">
            {settings && !ready && (
              <p className="mb-2 rounded border border-amber-900/70 bg-amber-950/40 px-2.5 py-1.5 text-[12px] leading-relaxed text-amber-300">
                選択中のプロバイダ「{providerLabel(settings, settings.provider)}」は
                {reason ?? "設定が不足しています"}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="ml-1 underline underline-offset-2 hover:text-amber-200"
                >
                  設定を開く
                </button>
              </p>
            )}

            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                placeholder={
                  ready
                    ? "質問を入力（Enter で送信 / Shift+Enter で改行）"
                    : "APIキーを設定すると送信できます"
                }
                className={`selectable min-h-[42px] flex-1 resize-none rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 ${t.body} leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none disabled:cursor-not-allowed`}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || input.trim().length === 0}
                className="h-9 shrink-0 rounded-md bg-emerald-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {sending ? "送信中…" : "送信"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
