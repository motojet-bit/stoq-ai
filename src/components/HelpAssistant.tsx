import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AppSettings, DisplayMessage } from "@/types";
import { streamChat } from "@/lib/llm/client";
import { providerReadiness } from "@/lib/config/providers";
import { buildHelpSystemPrompt, HELP_EXAMPLES } from "@/lib/prompts/helpKnowledge";
import { useBindings } from "@/lib/ui/shortcutStore";
import { isMac } from "@/lib/ui/shortcutKeys";
import { IconClose, IconHelp } from "@/components/Icons";
import { featureRequestUrl } from "@/lib/ui/tooltipText";

interface Props {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onOpenSettings: () => void;
  /** 初回チュートリアルを開き直す */
  onOpenTour: () => void;
}

const newId = () => crypto.randomUUID();

/**
 * アプリの使い方を案内するヘルプ専用アシスタント。
 *
 * 銘柄分析の対話とは**履歴を分ける**（保存もしない）。
 * 操作の質問が投資分析の会話に混ざると、あとで読み返しづらくなるため。
 */
export default function HelpAssistant({
  open,
  settings,
  onClose,
  onOpenSettings,
  onOpenTour,
}: Props) {
  const bindings = useBindings();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<DisplayMessage[]>(messages);
  messagesRef.current = messages;

  const sendKeyLabel = isMac() ? "⌘+Enter" : "Ctrl+Enter";
  const { ready, reason } = settings
    ? providerReadiness(settings, settings.provider)
    : { ready: false, reason: null };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || sending) return;

    const replyId = newId();
    const history = [...messages, { id: newId(), role: "user" as const, content: text }];
    setMessages([...history, { id: replyId, role: "assistant", content: "", streaming: true }]);
    setInput("");
    setSending(true);

    try {
      const { text: reply } = await streamChat(
        {
          // ナレッジは毎回いまの設定・キー割り当てから組み立てる
          system: buildHelpSystemPrompt(settings, bindings),
          messages: history
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        {
          onDelta: (delta) =>
            patch(replyId, {
              content:
                (messagesRef.current.find((m) => m.id === replyId)?.content ?? "") + delta,
            }),
        },
      );
      patch(replyId, { streaming: false, content: reply });
    } catch (e) {
      patch(replyId, {
        streaming: false,
        error: String(e instanceof Error ? e.message : e),
      });
    } finally {
      setSending(false);
    }
  };

  const patch = (id: string, changes: Partial<DisplayMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void ask(input);
    }
  };

  return (
    // 右下から立ち上がるドロワー。本体画面を隠しすぎないよう幅は控えめにする
    <aside
      role="dialog"
      aria-label="ヘルプアシスタント"
      className="fixed bottom-8 right-3 z-200 flex max-h-[70vh] w-96 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-white/5"
    >
      <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3">
        <span className="flex min-w-0 items-center gap-2">
          <IconHelp className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="truncate t-body font-semibold text-slate-100">
            ヘルプアシスタント
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded px-2 py-1 t-label text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              クリア
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="ヘルプを閉じる"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="t-body leading-relaxed text-slate-400">
              このアプリの使い方について何でも聞いてください。
              画面の見方、APIキーの設定、ショートカット、データ取得元の違いなどをご案内します。
            </p>
            <div className="flex flex-wrap gap-1.5">
              {HELP_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void ask(example)}
                  disabled={!ready}
                  className="rounded-full border border-slate-700 px-2.5 py-1 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {example}
                </button>
              ))}
            </div>
            {!ready && (
              <p className="t-label text-amber-400">
                {reason ?? "APIキーが未設定です。"}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="ml-1 underline underline-offset-2 hover:text-amber-300"
                >
                  設定を開く
                </button>
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id}>
                <div
                  className={`t-label mb-0.5 font-medium ${
                    m.role === "user" ? "text-slate-400" : "text-emerald-400"
                  }`}
                >
                  {m.role === "user" ? "あなた" : "ヘルプAI"}
                </div>
                {m.error ? (
                  <p className="selectable t-body rounded border border-red-900 bg-red-950/40 px-2.5 py-2 text-red-300">
                    {m.error}
                  </p>
                ) : (
                  <p className="selectable t-body whitespace-pre-wrap break-words text-slate-300">
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

      {/* 欲しい機能があれば開発者へ伝えられるようにする */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800 bg-slate-900/60 px-3 py-1.5">
        <button
          type="button"
          onClick={onOpenTour}
          className="t-label text-slate-400 underline underline-offset-2 transition-colors hover:text-emerald-300"
        >
          はじめかたを見る
        </button>
        <a
          href={featureRequestUrl()}
          target="_blank"
          rel="noreferrer"
          className="t-label text-slate-400 underline underline-offset-2 transition-colors hover:text-emerald-300"
        >
          欲しい機能がありませんか？開発者へリクエストを送る
        </a>
      </div>

      <div className="shrink-0 border-t border-slate-800 bg-slate-950 p-2">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || !ready}
            placeholder={ready ? `使い方を質問（${sendKeyLabel} で送信）` : "APIキーを設定すると使えます"}
            className="selectable t-body max-h-32 min-h-10 min-w-0 flex-1 resize-y overflow-y-auto rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => void ask(input)}
            disabled={sending || !ready || input.trim().length === 0}
            className="t-body min-h-10 shrink-0 rounded-md bg-emerald-600 px-3 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {sending ? "…" : "送信"}
          </button>
        </div>
      </div>
    </aside>
  );
}
