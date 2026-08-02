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
import type { SlotId } from "@/lib/ui/layoutStore";
import { IconMessage } from "@/components/Icons";
import PanelHeader from "@/components/PanelHeader";
import PromptLibraryMenu from "@/components/PromptLibraryMenu";
import { activeSystemPrompt } from "@/lib/prompts/promptLibrary";
import { isMac } from "@/lib/ui/shortcutKeys";
import { useChatDraft } from "@/lib/chat/chatDraft";
import {
  attachChatFiles,
  buildAttachmentContext,
  clearChatAttachments,
  getChatAttachments,
  MAX_CHAT_ATTACHMENTS,
  removeChatAttachment,
  useChatAttachments,
  useChatAttachmentsBusy,
} from "@/lib/chat/chatAttachments";
import { IconClose, IconPaperclip } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  settings: AppSettings | null;
  /** 現在開いている銘柄。新規チャットに紐づける */
  ticker: string | null;
  /** 最小化できない場合の理由（最後の 1 枚は畳ませない） */
  collapseDisabledReason?: string | null;
  slot?: SlotId;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

const newId = () => crypto.randomUUID();

/** 対話パネル。会話は SQLite に保存され、サイドバーから復元できる。 */
export default function ChatPanel({
  settings,
  ticker,
  collapseDisabledReason = null,
  slot,
  onToggleCollapse,
  onOpenSettings,
}: Props) {
  const messages = useChatMessages();
  const loadingHistory = useChatLoading();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /*
   * 単発のプレスリリースなどをここから直接読み込ませる。
   * **上部ドロップゾーンの「一時保存中の資料」とは別管理。**
   * あちらは分析に毎回渡る恒久的なコンテキスト、こちらは使い捨て。
   */
  const fileRef = useRef<HTMLInputElement>(null);
  const attachments = useChatAttachments();
  const attaching = useChatAttachmentsBusy();
  const t = useT();

  const sendKeyLabel = isMac() ? "⌘+Enter" : "Ctrl+Enter";

  /*
   * 過去ログからの「対話へ引用」を受け取る。
   * 入力中の内容は消さず、後ろに足す（書きかけを失わせない）。
   */
  const draft = useChatDraft();
  useEffect(() => {
    if (!draft) return;
    setInput((prev) => (prev.trim() === "" ? draft.text : `${prev}

${draft.text}`));
    inputRef.current?.focus();
    // seq が変わったときだけ反映する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.seq]);

  /*
   * 入力量に合わせて高さを自動調整する。
   * 一度 auto に戻してから scrollHeight を測らないと、縮むときに追従しない。
   * CSS 側の max-height を超えたぶんはスクロールに任せる。
   */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // onDelta の中から最新の本文を参照するための保持
  const messagesRef = useRef<DisplayMessage[]>(messages);
  messagesRef.current = messages;

  const { ready, reason } = settings
    ? providerReadiness(settings, settings.provider)
    : { ready: false, reason: null };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    // 添付があれば本文の前に載せる（送ったら使い切りで捨てる）
    const attached = getChatAttachments();
    const withContext = `${buildAttachmentContext(attached)}${text}`;

    const userMessage: DisplayMessage = { id: newId(), role: "user", content: text };
    const replyId = newId();
    const history = [...messages, userMessage];

    setMessages([...history, { id: replyId, role: "assistant", content: "", streaming: true }]);
    setInput("");
    setSending(true);

    // ユーザー発言を先に保存する（応答が失敗しても質問は残る）
    // **保存するのは質問本文だけ。** 資料の全文を履歴に残すと肥大化する
    await persistMessage("user", text, ticker);
    clearChatAttachments();

    try {
      const { text: reply } = await streamChat(
        {
          // 送信時点で選ばれている役割を使う（対話中に切り替えられる）
          system: activeSystemPrompt(),
          // エラー表示用のメッセージは送らない
          messages: history
            .filter((m) => !m.error)
            .map((m) =>
              // 送信するときだけ、最後の発言に添付を差し込む
              m.id === userMessage.id
                ? { role: m.role, content: withContext }
                : { role: m.role, content: m.content },
            ),
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

  /**
   * **Ctrl+Enter（mac は Cmd+Enter）で送信、Enter は改行。**
   * 長文プロンプトを書く途中で誤送信しないための割り当て。
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className="panel bg-slate-950" data-panel-slot={slot}>
      <PanelHeader
        icon={<IconMessage className="h-3.5 w-3.5" />}
        title={t("panel.chat")}
        slot={slot}
        onToggleCollapse={onToggleCollapse}
        collapseDisabledReason={collapseDisabledReason}
        actions={
          <>
            {settings && (
              <span className="t-label min-w-0 truncate font-mono text-slate-600">
                {providerLabel(settings, settings.provider)}
                {activeModel ? ` / ${activeModel}` : ""}
              </span>
            )}
            <PromptLibraryMenu />
          </>
        }
      />

      <>
          <div ref={scrollRef} className="panel-scroll px-4 py-3">
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
              <div className="t-body space-y-2 text-slate-500">
                <p className="selectable">{t("chat.empty")}</p>
                {!ready && (
                  <p className="text-amber-500/90">
                    {t("chat.noKey")}
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="ml-1 underline underline-offset-2 hover:text-amber-400"
                    >
                      {t("help.openSettings")}
                    </button>
                  </p>
                )}
              </div>
            ) : (
              <ul className="space-y-4">
                {messages.map((m) => (
                  <li key={m.id}>
                    <div
                      className={`t-label mb-1 font-medium ${
                        m.role === "user" ? "text-slate-400" : "text-emerald-400"
                      }`}
                    >
                      {m.role === "user" ? t("chat.you") : t("chat.ai")}
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

          {/*
            入力欄は shrink-0 で常に最下部に残す。
            文字サイズを 20px にしても送信ボタンが埋もれないよう、
            textarea 側に最大高さとスクロールを持たせている。
          */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-950 p-2">
            {settings && !ready && (
              <p className="t-label mb-2 rounded border border-amber-900/70 bg-amber-950/40 px-2.5 py-1.5 text-amber-300">
                選択中のプロバイダ「{providerLabel(settings, settings.provider)}」は
                {reason ?? t("chat.settingsMissing")}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="ml-1 underline underline-offset-2 hover:text-amber-200"
                >
                  {t("help.openSettings")}
                </button>
              </p>
            )}

            <div className="flex items-end gap-2">
              {/* 最新の一次資料をその場で足せるようにする */}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.markdown,.pptx,.docx,.html,.htm,.csv,.json"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) void attachChatFiles(files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={attaching}
                title={t("chat.attachHint", { label: t("chat.attach") })}
                aria-label={t("chat.attach")}
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 text-slate-400 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-40"
              >
                <IconPaperclip className="h-4 w-4" />
                {attachments.length > 0 && (
                  <span className="font-mono t-label">{attachments.length}</span>
                )}
              </button>

              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                title={t("chat.composerHint", { key: sendKeyLabel })}
                placeholder={
                  ready
                    ? t("chat.placeholderLong", { key: sendKeyLabel })
                    : t("chat.placeholderNoKey")
                }
                /*
                 * 入力量に合わせて自動で伸び、上限に達したらスクロールする。
                 * `resize-y` も付けて、ユーザーが自分で高さを決められるようにする。
                 */
                className="selectable t-body max-h-64 min-h-11 min-w-0 flex-1 resize-y overflow-y-auto rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || input.trim().length === 0}
                title={t("chat.sendAlso", { key: sendKeyLabel })}
                className="t-body min-h-11 shrink-0 rounded-md bg-emerald-600 px-4 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {sending ? t("chat.sending") : t("chat.send")}
              </button>
            </div>

            {/* 添付は「この会話だけ」。上部の資料一覧には入らない */}
            {(attachments.length > 0 || attaching) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {attaching && (
                  <span className="t-label text-slate-500">{t("common.loading")}</span>
                )}
                {attachments.map((item) => (
                  <span
                    key={item.id}
                    title={t("chat.attachmentMeta", {
                    name: item.name,
                    chars: item.charCount.toLocaleString(),
                    tokens: item.tokenEstimate.toLocaleString(),
                  })}
                    className="flex min-h-6 max-w-56 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-1.5 t-label text-slate-300"
                  >
                    <IconPaperclip className="h-3 w-3 shrink-0 text-slate-500" />
                    <span className="min-w-0 truncate">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => removeChatAttachment(item.id)}
                      aria-label={t("chat.attachmentRemove", { name: item.name })}
                      className="shrink-0 rounded text-slate-600 hover:text-red-300"
                    >
                      <IconClose className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <p className="t-label mt-1 flex flex-wrap items-center justify-between gap-2 text-slate-600">
              <span>
                📎 の資料は**この会話でのみ**使われ、送信後に破棄されます（最大
                {MAX_CHAT_ATTACHMENTS} 件）
              </span>
              <span>{t("chat.sendHint", { key: sendKeyLabel })}</span>
            </p>
          </div>
      </>
    </section>
  );
}
