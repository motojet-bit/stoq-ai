import { useSyncExternalStore } from "react";
import { extractText, isSupported } from "@/lib/parser/extractText";
import { estimateTokens } from "@/lib/parser/tokenCount";
import { toastError } from "@/lib/ui/toastStore";

/**
 * 対話パネルの添付ファイル。
 *
 * **上部ドロップゾーンの「一時保存中の資料」とは完全に別物として扱う。**
 * あちらは 20項目分析に毎回渡る恒久的なコンテキストで、
 * こちらは「いまの会話で 1 回使うだけ」の使い捨て。
 * 混ぜると、最新のプレスリリースを 1 度見せたつもりが
 * それ以降のすべての分析に混入してしまう。
 *
 * したがって **Rust 側へは保存しない**（`documents_stage` を呼ばない）。
 * アプリを閉じれば消える。
 */

export interface ChatAttachment {
  id: string;
  name: string;
  /** 抽出済みテキスト */
  text: string;
  sizeBytes: number;
  charCount: number;
  tokenEstimate: number;
}

/** 対話に載せる添付の上限。多すぎるとプロンプトが破綻する */
export const MAX_CHAT_ATTACHMENTS = 5;

let attachments: ChatAttachment[] = [];
let busy = false;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 購読を外から張れるようにする（React の外・テスト用）。 */
export const subscribeChatAttachments = subscribe;

export function useChatAttachments(): ChatAttachment[] {
  return useSyncExternalStore(
    subscribe,
    () => attachments,
    () => attachments,
  );
}

export function useChatAttachmentsBusy(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => busy,
    () => busy,
  );
}

export function getChatAttachments(): ChatAttachment[] {
  return attachments;
}

/**
 * ファイルを添付する。**抽出だけを行い、どこにも保存しない。**
 * 同じ名前のファイルは差し替える（貼り直しで最新にできるように）。
 */
export async function attachChatFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;

  busy = true;
  emit();

  try {
    for (const file of files) {
      if (!isSupported(file.name)) {
        toastError(
          "この形式は読み込めません",
          `${file.name}（PDF / DOCX / PPTX / TXT / MD / HTML / CSV / JSON に対応）`,
        );
        continue;
      }

      try {
        const text = await extractText(file);
        const next: ChatAttachment = {
          id: crypto.randomUUID(),
          name: file.name,
          text,
          sizeBytes: file.size,
          charCount: text.length,
          tokenEstimate: estimateTokens(text),
        };

        const without = attachments.filter((a) => a.name !== file.name);
        // 上限を超えたら古いものから外す（押しても無反応にしない）
        attachments = [...without, next].slice(-MAX_CHAT_ATTACHMENTS);
        emit();
      } catch (e) {
        toastError(`${file.name} を読み込めませんでした`, e);
      }
    }
  } finally {
    busy = false;
    emit();
  }
}

export function removeChatAttachment(id: string): void {
  const next = attachments.filter((a) => a.id !== id);
  if (next.length === attachments.length) return;
  attachments = next;
  emit();
}

/** 会話を切り替えたら捨てる。使い捨てなので持ち越さない。 */
export function clearChatAttachments(): void {
  if (attachments.length === 0) return;
  attachments = [];
  emit();
}

/**
 * 添付を送信メッセージに載せる形にする。
 *
 * **本文の前に置く。** 質問より先に資料があったほうが、
 * 「この資料について」という文脈で読まれやすい。
 */
export function buildAttachmentContext(items: ChatAttachment[]): string {
  if (items.length === 0) return "";

  const sections = items
    .map(
      (item) =>
        `<資料 name="${item.name}" 文字数="${item.charCount}">\n${item.text}\n</資料>`,
    )
    .join("\n\n");

  return `以下は今回の質問のために添付した一次資料です（${items.length} 件）。\n\n${sections}\n\n`;
}
